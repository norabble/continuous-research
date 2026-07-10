/**
 * The `sense` and `record-decline` command bodies — orchestration that wires the
 * sensor, dedup, and write flows together. Every dependency (the port, the
 * sensor runner, artifact reads) is injected, so the command logic is unit-
 * testable without GitHub, a child process, or the filesystem (design rule 1).
 * The thin I/O shell that constructs the real deps lives in `cli.ts` (next step).
 */

import type { Descriptor, DedupState } from "./types";
import type { GitHubPort } from "./ports";
import type { ResearchConfig } from "./config";
import type { SensorRunner } from "./sensor";
import { parseDetectionResult } from "./sensor";
import { dedupe } from "./dedup";
import { buildProvenanceStub, parseProvenanceStub } from "./provenance";
import { proposeDataPR, recordDecline } from "./flows";
import { scaffoldFiles } from "./scaffold";
import { assertDescriptor, descriptorFromLabel, provenancePathFor } from "./descriptor";
import type { ChangedKey } from "./results";
import { diffResults, resolveResultsPath } from "./results";
import { parseAnnotations, type ClaimIndex } from "./annotations";
import { affectedClaims } from "./impact";
import { lintConsistency, type LintFinding } from "./linter";
import type { MaintenanceItem, PendingUpdate, SiteData, SiteFile } from "./site-render";
import { renderSite } from "./site-render";
import {
  DRIFT_LABEL,
  DRIFT_LABEL_COLOR,
  DRIFT_LABEL_DESCRIPTION,
  parseDriftReport,
  planDriftEscalation,
} from "./drift";

export type SenseOutcome =
  | { action: "none"; reason: string }
  | { action: "skip"; state: DedupState; descriptor: Descriptor }
  | { action: "proposed"; descriptor: Descriptor; prNumber: number; branch: string };

export interface SenseDeps {
  config: ResearchConfig;
  runSensor: SensorRunner;
  port: GitHubPort;
  readArtifact: (path: string) => Promise<string>;
}

export async function runSense(deps: SenseDeps): Promise<SenseOutcome> {
  const detection = parseDetectionResult(await deps.runSensor(deps.config.sensor));
  if (!detection.changed) return { action: "none", reason: "sensor reported no change" };

  const { descriptor } = detection;
  const { state, action } = await dedupe(deps.port, descriptor);
  if (action === "skip") return { action: "skip", state, descriptor };

  const provenance = buildProvenanceStub({
    descriptor,
    source: detection.source,
    retrievedAt: detection.retrievedAt,
    hash: detection.hash,
  });
  const artifacts = await Promise.all(
    detection.artifacts.map(async (path) => ({ path, content: await deps.readArtifact(path) })),
  );
  const { prNumber, branch } = await proposeDataPR(deps.port, {
    descriptor,
    provenance,
    artifacts,
  });
  return { action: "proposed", descriptor, prNumber, branch };
}

export interface RecordDeclineDeps {
  port: GitHubPort;
  descriptor: Descriptor;
  prNumber: number;
  declinedAt: string;
  declinedBy?: string;
  defaultReason?: string;
}

export async function runRecordDecline(deps: RecordDeclineDeps): Promise<void> {
  const latest = await deps.port.latestTrustedComment(deps.prNumber);
  const reason = latest ?? deps.defaultReason ?? "Closed without merge; no reason provided.";
  await recordDecline(deps.port, {
    descriptor: deps.descriptor,
    reason,
    declinedAt: deps.declinedAt,
    prNumber: deps.prNumber,
    declinedBy: deps.declinedBy,
  });
}

export interface InitDeps {
  /** Writes the file if absent; resolves true if written, false if it existed. */
  writeIfAbsent: (path: string, content: string) => Promise<boolean>;
}

export interface InitResultEntry {
  path: string;
  created: boolean;
}

export async function runInit(deps: InitDeps): Promise<InitResultEntry[]> {
  const results: InitResultEntry[] = [];
  for (const file of scaffoldFiles()) {
    results.push({ path: file.path, created: await deps.writeIfAbsent(file.path, file.content) });
  }
  return results;
}

export interface ImpactArtifact {
  edition: string;
  baseline: string | null;
  changed: ChangedKey[];
  affected: { claimId: string; backs: string[]; status: string }[];
  lint: LintFinding[];
}

export interface ImpactDeps {
  config: ResearchConfig;
  port: GitHubPort;
  /** Reads a file from the PR working tree (the checked-out branch). */
  readWorkingFile: (path: string) => Promise<string>;
  descriptor: string;
  /** The prior merged edition to diff against; absent ⇒ first edition. */
  against?: string;
}

export async function runImpact(deps: ImpactDeps): Promise<ImpactArtifact> {
  const impact = deps.config.impact;
  if (!impact?.enabled) throw new Error("impact layer is disabled (config.impact.enabled)");
  if (!impact.resultsPath) throw new Error("config.impact.resultsPath is required");
  // Descriptors flow into fs paths (resultsPath, the .impact.json output); validate
  // them the way the label/branch helpers do on the sense/decline paths.
  assertDescriptor(deps.descriptor);
  if (deps.against) assertDescriptor(deps.against);
  const findingsPath = impact.findings ?? "findings.md";

  const next: unknown = JSON.parse(
    await deps.readWorkingFile(resolveResultsPath(impact.resultsPath, deps.descriptor)),
  );
  const index = parseAnnotations(await deps.readWorkingFile(findingsPath));

  let changed: ChangedKey[] = [];
  let baseline: string | null = null;
  let priorIndex: ClaimIndex | undefined;
  if (deps.against) {
    const base = await deps.port.defaultBranch();
    const priorPath = resolveResultsPath(impact.resultsPath, deps.against);
    const priorRaw = await deps.port.readFileFromRef(base, priorPath);
    // Fail closed: a named baseline whose results are absent is an error, not an
    // empty diff. Treating it as {} would guess a baseline (every key "added")
    // and stamp it as real — contradicting "no guessed baseline".
    if (priorRaw === null) {
      throw new Error(`--against ${deps.against}: no results at ${priorPath} on ${base}`);
    }
    const prev: unknown = JSON.parse(priorRaw);
    changed = diffResults(prev, next);
    baseline = deps.against;
    const priorFindings = await deps.port.readFileFromRef(base, findingsPath);
    if (priorFindings !== null) priorIndex = parseAnnotations(priorFindings);
  }

  const affected = affectedClaims(changed, index).map((a) => ({
    claimId: a.claimId,
    backs: a.backs,
    status: a.status,
  }));
  const lint =
    impact.linter === false ? [] : lintConsistency({ results: next, index, changed, priorIndex });

  return { edition: deps.descriptor, baseline, changed, affected, lint };
}

export interface SiteDeps {
  config: ResearchConfig;
  port: GitHubPort;
  /** Injected so rendering stays deterministic (site-render.ts takes no clock). */
  generatedAt: string;
  /** Used when `config.site.title` is absent (CLI passes GITHUB_REPOSITORY). */
  fallbackTitle: string;
  /** "owner/repo", or null; threaded into SiteData for link rewriting (CLI passes GITHUB_REPOSITORY). */
  repoSlug: string | null;
}

/** First label that decodes to a data descriptor, or null (site's "is this a data-PR?" test). */
function firstDataDescriptor(labels: string[]): Descriptor | null {
  for (const label of labels) {
    const descriptor = descriptorFromLabel(label);
    if (descriptor !== null) return descriptor;
  }
  return null;
}

/**
 * Gathers SiteData from open PRs per the trust + labeling rules and renders
 * the site files; null when the site layer is off (the CLI logs and exits 0).
 */
export async function runSite(deps: SiteDeps): Promise<SiteFile[] | null> {
  const site = deps.config.site;
  if (!site?.enabled) return null;

  const prs = await deps.port.listOpenPullRequests();
  const updates: PendingUpdate[] = [];
  const maintenance: MaintenanceItem[] = [];

  for (const pr of prs) {
    // Trust rule: only the engine's own bot PRs are surfaced, even when a
    // human PR happens to carry a data label.
    if (!pr.authorLogin.endsWith("[bot]")) continue;

    const descriptor = firstDataDescriptor(pr.labels);
    if (descriptor === null) {
      maintenance.push({ title: pr.title, githubUrl: pr.htmlUrl });
      continue;
    }

    const impactMd = await deps.port.readFileFromRef(
      pr.headRef,
      `.research/impact/${descriptor}.md`,
    );
    const provenanceRaw = await deps.port.readFileFromRef(
      pr.headRef,
      provenancePathFor(descriptor),
    );
    // Fail closed: an invalid provenance stub is a data-integrity problem,
    // not something to paper over as "absent" — let the parse error propagate.
    const provenance = provenanceRaw === null ? null : parseProvenanceStub(provenanceRaw);

    updates.push({
      descriptor,
      proposedAt: pr.createdAt,
      impactMd,
      provenance,
      githubUrl: pr.htmlUrl,
    });
  }

  const defaultBranch = await deps.port.defaultBranch();
  const findingsMd = await deps.port.readFileFromRef(defaultBranch, "findings.md");

  const data: SiteData = {
    title: site.title ?? deps.fallbackTitle,
    description: site.description,
    generatedAt: deps.generatedAt,
    findingsMd,
    updates,
    maintenance,
    repoSlug: deps.repoSlug,
  };

  return renderSite(data);
}

export interface EscalateDriftDeps {
  github: GitHubPort;
  /** UTF-8 report content, or null when no report exists (the no-drift case). */
  readReport: () => Promise<string | null>;
  log: (message: string) => void;
}

export type EscalateDriftOutcome =
  | { outcome: "no-drift" }
  | { outcome: "created"; issueNumber: number }
  | { outcome: "commented"; issueNumber: number };

/**
 * Files or refreshes the single open sensor-drift issue from a drift report.
 * A normal sense run has no report — that's the no-drift case, not an error.
 * The touched issue is always re-locked (create and comment paths both): the
 * issue is agent-consumed instructions, so an open thread on a public repo
 * would be a prompt-injection channel.
 */
export async function escalateDrift(deps: EscalateDriftDeps): Promise<EscalateDriftOutcome> {
  const report = await deps.readReport();
  if (report === null) {
    deps.log("escalate-drift: no drift report — nothing to do");
    return { outcome: "no-drift" };
  }
  // Fail-fast: validate the report BEFORE any GitHub write. planDriftEscalation
  // re-parses below (kept simple, signatures stable) — this call exists only to
  // reject a malformed report ahead of ensureLabel/listOpenIssueNumbersByLabel.
  parseDriftReport(report);
  await deps.github.ensureLabel(DRIFT_LABEL, DRIFT_LABEL_DESCRIPTION, DRIFT_LABEL_COLOR);
  const open = await deps.github.listOpenIssueNumbersByLabel(DRIFT_LABEL);
  const plan = planDriftEscalation(report, open);
  let issueNumber: number;
  if (plan.action === "create") {
    issueNumber = await deps.github.createIssue(plan.title, plan.body, [DRIFT_LABEL]);
    deps.log(`escalate-drift: opened issue #${issueNumber}`);
  } else {
    issueNumber = plan.issueNumber as number;
    await deps.github.commentOnIssue(issueNumber, plan.body);
    deps.log(`escalate-drift: commented on open issue #${issueNumber}`);
  }
  await deps.github.lockIssue(issueNumber);
  return plan.action === "create"
    ? { outcome: "created", issueNumber }
    : { outcome: "commented", issueNumber };
}

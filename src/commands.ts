/**
 * The `sense` and `record-decline` command bodies — orchestration that wires the
 * sensor, dedup, and write flows together. Every dependency (the port, the
 * sensor runner, artifact reads) is injected, so the command logic is unit-
 * testable without GitHub, a child process, or the filesystem (design rule 1).
 * The thin I/O shell that constructs the real dependencies lives in `cli.ts` (next step).
 */

import type { Descriptor, DedupState } from "./types";
import type { GitHubPort } from "./ports";
import type { ResearchConfig } from "./config";
import type { SensorRunner } from "./sensor";
import { parseDetectionResult } from "./sensor";
import { dedupe } from "./dedup";
import type { ProvenanceStub } from "./provenance";
import { buildProvenanceStub, parseProvenanceStub } from "./provenance";
import { proposeDataPR, recordDecline, recordVerification } from "./flows";
import type { DeclineRecord } from "./decline";
import { parseDeclineRecord } from "./decline";
import type { OkfFacts, OkfFile } from "./okf";
import { buildOkfBundle } from "./okf";
import { scaffoldFiles } from "./scaffold";
import {
  assertDescriptor,
  descriptorFromLabel,
  isValidDescriptor,
  provenancePathFor,
} from "./descriptor";
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

/** Where the engine's own records live; the OKF export enumerates both. */
const PROVENANCE_DIR = ".research/provenance";
const DECISIONS_DIR = ".research/decisions";
/** Optional instance-authored attester description; the export falls back to the default. */
const ATTESTER_PATH = ".research/attester.md";

export type SenseOutcome =
  | { action: "none"; reason: string }
  | { action: "skip"; state: DedupState; descriptor: Descriptor }
  | { action: "proposed"; descriptor: Descriptor; prNumber: number; branch: string };

export interface SenseDependencies {
  config: ResearchConfig;
  runSensor: SensorRunner;
  port: GitHubPort;
  readArtifact: (path: string) => Promise<string>;
}

export async function runSense(dependencies: SenseDependencies): Promise<SenseOutcome> {
  const detection = parseDetectionResult(await dependencies.runSensor(dependencies.config.sensor));
  if (!detection.changed) return { action: "none", reason: "sensor reported no change" };

  const { descriptor } = detection;
  const { state, action } = await dedupe(dependencies.port, descriptor);
  if (action === "skip") return { action: "skip", state, descriptor };

  // `sources` / `generated` are optional in the sensor contract; when the
  // sensor says nothing, the flat `source` upcasts to a single entry.
  const provenance = buildProvenanceStub({
    descriptor,
    source: detection.source,
    ...(detection.sources !== undefined ? { sources: detection.sources } : {}),
    ...(detection.generated !== undefined ? { generated: detection.generated } : {}),
    retrievedAt: detection.retrievedAt,
    hash: detection.hash,
  });
  const artifacts = await Promise.all(
    detection.artifacts.map(async (path) => ({
      path,
      content: await dependencies.readArtifact(path),
    })),
  );
  const { prNumber, branch } = await proposeDataPR(dependencies.port, {
    descriptor,
    provenance,
    artifacts,
  });
  return { action: "proposed", descriptor, prNumber, branch };
}

export interface RecordDeclineDependencies {
  port: GitHubPort;
  descriptor: Descriptor;
  prNumber: number;
  declinedAt: string;
  declinedBy?: string;
  defaultReason?: string;
}

export async function runRecordDecline(dependencies: RecordDeclineDependencies): Promise<void> {
  const latest = await dependencies.port.latestTrustedComment(dependencies.prNumber);
  const reason =
    latest ?? dependencies.defaultReason ?? "Closed without merge; no reason provided.";
  await recordDecline(dependencies.port, {
    descriptor: dependencies.descriptor,
    reason,
    declinedAt: dependencies.declinedAt,
    prNumber: dependencies.prNumber,
    declinedBy: dependencies.declinedBy,
  });
}

export interface RecordVerificationDependencies {
  port: GitHubPort;
  descriptor: Descriptor;
  /** OKF actor for whoever merged the data-PR. */
  by: string;
  /** ISO-8601 merge timestamp. */
  at: string;
}

/** Mirror of {@link runRecordDecline} for the merge half of the same event. */
export async function runRecordVerification(
  dependencies: RecordVerificationDependencies,
): Promise<{ recorded: boolean }> {
  return recordVerification(dependencies.port, {
    descriptor: dependencies.descriptor,
    by: dependencies.by,
    at: dependencies.at,
  });
}

export interface InitDependencies {
  /** Writes the file if absent; resolves true if written, false if it existed. */
  writeIfAbsent: (path: string, content: string) => Promise<boolean>;
}

export interface InitResultEntry {
  path: string;
  created: boolean;
}

export async function runInit(dependencies: InitDependencies): Promise<InitResultEntry[]> {
  const results: InitResultEntry[] = [];
  for (const file of scaffoldFiles()) {
    results.push({
      path: file.path,
      created: await dependencies.writeIfAbsent(file.path, file.content),
    });
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

export interface ImpactDependencies {
  config: ResearchConfig;
  port: GitHubPort;
  /** Reads a file from the PR working tree (the checked-out branch). */
  readWorkingFile: (path: string) => Promise<string>;
  /** Lists a directory in the working tree; supplies the linter's accepted-edition set. */
  listDir: (path: string) => Promise<string[]>;
  descriptor: string;
  /** The prior merged edition to diff against; absent ⇒ first edition. */
  against?: string;
}

export async function runImpact(dependencies: ImpactDependencies): Promise<ImpactArtifact> {
  const impact = dependencies.config.impact;
  if (!impact?.enabled) throw new Error("impact layer is disabled (config.impact.enabled)");
  if (!impact.resultsPath) throw new Error("config.impact.resultsPath is required");
  // Descriptors flow into fs paths (resultsPath, the .impact.json output); validate
  // them the way the label/branch helpers do on the sense/decline paths.
  assertDescriptor(dependencies.descriptor);
  if (dependencies.against) assertDescriptor(dependencies.against);
  const findingsPath = impact.findings ?? "findings.md";

  const next: unknown = JSON.parse(
    await dependencies.readWorkingFile(
      resolveResultsPath(impact.resultsPath, dependencies.descriptor),
    ),
  );
  const index = parseAnnotations(await dependencies.readWorkingFile(findingsPath));

  let changed: ChangedKey[] = [];
  let baseline: string | null = null;
  let priorIndex: ClaimIndex | undefined;
  if (dependencies.against) {
    const base = await dependencies.port.defaultBranch();
    const priorPath = resolveResultsPath(impact.resultsPath, dependencies.against);
    const priorRaw = await dependencies.port.readFileFromRef(base, priorPath);
    // Fail closed: a named baseline whose results are absent is an error, not an
    // empty diff. Treating it as {} would guess a baseline (every key "added")
    // and stamp it as real — contradicting "no guessed baseline".
    if (priorRaw === null) {
      throw new Error(`--against ${dependencies.against}: no results at ${priorPath} on ${base}`);
    }
    const prev: unknown = JSON.parse(priorRaw);
    changed = diffResults(prev, next);
    baseline = dependencies.against;
    const priorFindings = await dependencies.port.readFileFromRef(base, findingsPath);
    if (priorFindings !== null) priorIndex = parseAnnotations(priorFindings);
  }

  const affected = affectedClaims(changed, index).map((a) => ({
    claimId: a.claimId,
    backs: a.backs,
    status: a.status,
  }));
  // Impact runs on the PR branch checkout, which carries the incoming stub — so
  // the triggering descriptor is already "accepted" for lint purposes on the
  // very PR that introduces it.
  const knownEditions = (await dependencies.listDir(PROVENANCE_DIR))
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.slice(0, -".json".length))
    .filter(isValidDescriptor);

  const lint =
    impact.linter === false
      ? []
      : lintConsistency({ results: next, index, changed, priorIndex, knownEditions });

  return { edition: dependencies.descriptor, baseline, changed, affected, lint };
}

export interface SiteDependencies {
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
export async function runSite(dependencies: SiteDependencies): Promise<SiteFile[] | null> {
  const site = dependencies.config.site;
  if (!site?.enabled) return null;

  const prs = await dependencies.port.listOpenPullRequests();
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

    const impactMd = await dependencies.port.readFileFromRef(
      pr.headRef,
      `.research/impact/${descriptor}.md`,
    );
    const provenanceRaw = await dependencies.port.readFileFromRef(
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

  const defaultBranch = await dependencies.port.defaultBranch();
  const findingsMd = await dependencies.port.readFileFromRef(defaultBranch, "findings.md");

  const data: SiteData = {
    title: site.title ?? dependencies.fallbackTitle,
    description: site.description,
    generatedAt: dependencies.generatedAt,
    findingsMd,
    updates,
    maintenance,
    repoSlug: dependencies.repoSlug,
  };

  return renderSite(data);
}

export interface OkfExportDependencies {
  config: ResearchConfig;
  /** File names directly inside a directory; `[]` when it does not exist. */
  listDir: (path: string) => Promise<string[]>;
  /** Reads a file from the checked-out working tree. */
  readWorkingFile: (path: string) => Promise<string>;
  /** Used when neither `okf.title` nor `site.title` is set (CLI passes GITHUB_REPOSITORY). */
  fallbackTitle: string;
}

/**
 * Renders the OKF bundle from the instance's own committed record; null when
 * the layer is off (the CLI logs and exits 0).
 *
 * Deliberately takes **no `GitHubPort`**: unlike the site, which surfaces *open*
 * PRs, the bundle projects the *accepted* record — and that lives entirely on
 * the default branch, i.e. in the checkout. So this needs no token and no
 * network, and the bundle is reproducible offline.
 */
export async function runOkfExport(dependencies: OkfExportDependencies): Promise<OkfFile[] | null> {
  const okf = dependencies.config.okf;
  if (!okf?.enabled) return null;

  const editions: ProvenanceStub[] = [];
  for (const name of await dependencies.listDir(PROVENANCE_DIR)) {
    if (!name.endsWith(".json")) continue;
    // Fail closed, as runSite does: a malformed stub is a data-integrity
    // problem, not something to skip quietly.
    editions.push(
      parseProvenanceStub(await dependencies.readWorkingFile(`${PROVENANCE_DIR}/${name}`)),
    );
  }

  const declines: DeclineRecord[] = [];
  for (const name of await dependencies.listDir(DECISIONS_DIR)) {
    if (!name.endsWith(".md")) continue;
    declines.push(
      parseDeclineRecord(await dependencies.readWorkingFile(`${DECISIONS_DIR}/${name}`)),
    );
  }

  const findingsPath = dependencies.config.impact?.findings ?? "findings.md";
  let findingsMd: string | null;
  try {
    findingsMd = await dependencies.readWorkingFile(findingsPath);
  } catch {
    findingsMd = null; // an instance without prose still gets a valid bundle
  }

  // The framework's default description is true for every instance; an instance
  // that commits its own describes the part the framework cannot know — its
  // project-defined descriptor scheme.
  let attester: string | null;
  try {
    attester = await dependencies.readWorkingFile(ATTESTER_PATH);
  } catch {
    attester = null;
  }

  const facts: OkfFacts = {
    title: okf.title ?? dependencies.config.site?.title ?? dependencies.fallbackTitle,
    editions,
    declines,
    findingsMd,
    sensor: { command: dependencies.config.sensor, attester },
  };
  if (okf.description !== undefined) facts.description = okf.description;
  if (okf.staleAfterDays !== undefined) facts.staleAfterDays = okf.staleAfterDays;
  return buildOkfBundle(facts);
}

export interface EscalateDriftDependencies {
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
export async function escalateDrift(
  dependencies: EscalateDriftDependencies,
): Promise<EscalateDriftOutcome> {
  const report = await dependencies.readReport();
  if (report === null) {
    dependencies.log("escalate-drift: no drift report — nothing to do");
    return { outcome: "no-drift" };
  }
  // Fail-fast: validate the report BEFORE any GitHub write. planDriftEscalation
  // re-parses below (kept simple, signatures stable) — this call exists only to
  // reject a malformed report ahead of ensureLabel/listOpenIssueNumbersByLabel.
  parseDriftReport(report);
  await dependencies.github.ensureLabel(DRIFT_LABEL, DRIFT_LABEL_DESCRIPTION, DRIFT_LABEL_COLOR);
  const open = await dependencies.github.listOpenIssueNumbersByLabel(DRIFT_LABEL);
  const plan = planDriftEscalation(report, open);
  let issueNumber: number;
  if (plan.action === "create") {
    issueNumber = await dependencies.github.createIssue(plan.title, plan.body, [DRIFT_LABEL]);
    dependencies.log(`escalate-drift: opened issue #${issueNumber}`);
  } else {
    issueNumber = plan.issueNumber as number;
    await dependencies.github.commentOnIssue(issueNumber, plan.body);
    dependencies.log(`escalate-drift: commented on open issue #${issueNumber}`);
  }
  await dependencies.github.lockIssue(issueNumber);
  return plan.action === "create"
    ? { outcome: "created", issueNumber }
    : { outcome: "commented", issueNumber };
}

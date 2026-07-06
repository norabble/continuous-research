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
import { buildProvenanceStub } from "./provenance";
import { proposeDataPR, recordDecline } from "./flows";
import { scaffoldFiles } from "./scaffold";
import { assertDescriptor } from "./descriptor";
import type { ChangedKey } from "./results";
import { diffResults, resolveResultsPath } from "./results";
import { parseAnnotations, type ClaimIndex } from "./annotations";
import { affectedClaims } from "./impact";
import { lintConsistency, type LintFinding } from "./linter";

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

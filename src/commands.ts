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
  const latest = await deps.port.latestComment(deps.prNumber);
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

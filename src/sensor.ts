/**
 * The sensor ↔ engine contract (Phase-1 plan → Step 5, decision 1).
 *
 * The engine runs the project's declared `sensor` command and parses one JSON
 * object from its stdout. The descriptor is opaque (scheme stays
 * project-defined); `artifacts` are paths the sensor wrote into the working
 * tree, which the engine reads and commits on the data-PR branch.
 */

import type { Descriptor } from "./types";
import type { Actor, ProvenanceSourceInput } from "./provenance";

export type DetectionResult =
  | { changed: false }
  | {
      changed: true;
      descriptor: Descriptor;
      source: string;
      retrievedAt: string;
      hash: string;
      artifacts: string[];
      /**
       * Optional richer provenance (CONCEPT.md → Interop): a sensor that reads
       * several materials names them here. Absent ⇒ the engine upcasts the flat
       * `source`, so existing sensors keep working unchanged.
       */
      sources?: ProvenanceSourceInput[];
      /** Optional: what produced this edition, in the OKF actor grammar. */
      generated?: Actor;
    };

/**
 * The keys a sensor run must return — i.e. the contract's *receipt*, which is
 * what OKF's `executor.receipt` names (docs/okf-interop.md). Kept here beside
 * {@link parseDetectionResult} so the published contract cannot drift from the
 * one the engine actually enforces.
 */
export const DETECTION_RECEIPT_KEYS: readonly string[] = [
  "changed",
  "descriptor",
  "source",
  "retrievedAt",
  "hash",
  "artifacts",
];

/** Runs a sensor command and returns its stdout. Injected so orchestration stays pure. */
export type SensorRunner = (command: string) => Promise<string>;

/** `label` names the field in errors; `key` is what we actually look up. */
function readString(obj: Record<string, unknown>, key: string, label: string = key): string {
  const v = obj[key];
  if (typeof v !== "string" || v.trim() === "") {
    throw new Error(`detection result "${label}" must be a non-empty string`);
  }
  return v;
}

function parseArtifacts(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error('detection result "artifacts" must be an array of strings');
  }
  const arr: unknown[] = value;
  if (!arr.every((v): v is string => typeof v === "string")) {
    throw new Error('detection result "artifacts" must be an array of strings');
  }
  return arr;
}

function parseSources(value: unknown): ProvenanceSourceInput[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('detection result "sources" must be a non-empty array');
  }
  return (value as unknown[]).map((entry, i) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error(`detection result "sources[${i}]" must be an object`);
    }
    const o = entry as Record<string, unknown>;
    const out: ProvenanceSourceInput = {
      resource: readString(o, "resource", `sources[${i}].resource`),
    };
    for (const key of ["id", "title", "lastModified", "hash"] as const) {
      const v = o[key];
      if (v === undefined) continue;
      if (typeof v !== "string" || v.trim() === "") {
        throw new Error(`detection result "sources[${i}].${key}" must be a non-empty string`);
      }
      out[key] = v;
    }
    return out;
  });
}

function parseGenerated(value: unknown): Actor | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error('detection result "generated" must be an object');
  }
  const o = value as Record<string, unknown>;
  return {
    by: readString(o, "by", "generated.by"),
    at: readString(o, "at", "generated.at"),
  };
}

export function parseDetectionResult(stdout: string): DetectionResult {
  const data: unknown = JSON.parse(stdout);
  if (typeof data !== "object" || data === null) {
    throw new Error("detection result must be a JSON object");
  }
  const obj = data as Record<string, unknown>;
  if (obj.changed !== true) return { changed: false };
  const result: DetectionResult = {
    changed: true,
    descriptor: readString(obj, "descriptor"),
    source: readString(obj, "source"),
    retrievedAt: readString(obj, "retrievedAt"),
    hash: readString(obj, "hash"),
    artifacts: parseArtifacts(obj.artifacts),
  };
  const sources = parseSources(obj.sources);
  if (sources !== undefined) result.sources = sources;
  const generated = parseGenerated(obj.generated);
  if (generated !== undefined) result.generated = generated;
  return result;
}

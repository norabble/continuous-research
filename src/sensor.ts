/**
 * The sensor ↔ engine contract (Phase-1 plan → Step 5, decision 1).
 *
 * The engine runs the project's declared `sensor` command and parses one JSON
 * object from its stdout. The descriptor is opaque (scheme stays
 * project-defined); `artifacts` are paths the sensor wrote into the working
 * tree, which the engine reads and commits on the data-PR branch.
 */

import type { Descriptor } from "./types";

export type DetectionResult =
  | { changed: false }
  | {
      changed: true;
      descriptor: Descriptor;
      source: string;
      retrievedAt: string;
      hash: string;
      artifacts: string[];
    };

/** Runs a sensor command and returns its stdout. Injected so orchestration stays pure. */
export type SensorRunner = (command: string) => Promise<string>;

function readString(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  if (typeof v !== "string" || v.trim() === "") {
    throw new Error(`detection result "${key}" must be a non-empty string`);
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

export function parseDetectionResult(stdout: string): DetectionResult {
  const data: unknown = JSON.parse(stdout);
  if (typeof data !== "object" || data === null) {
    throw new Error("detection result must be a JSON object");
  }
  const obj = data as Record<string, unknown>;
  if (obj.changed !== true) return { changed: false };
  return {
    changed: true,
    descriptor: readString(obj, "descriptor"),
    source: readString(obj, "source"),
    retrievedAt: readString(obj, "retrievedAt"),
    hash: readString(obj, "hash"),
    artifacts: parseArtifacts(obj.artifacts),
  };
}

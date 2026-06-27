/**
 * Provenance stub (CONCEPT.md → "Provenance & storage").
 *
 * The always-committed lineage record for a descriptor, present on `main` even
 * when the bulk data is not stored — and therefore the durable "merged" marker
 * the dedup check reads. Pure builders / (de)serializers only; the actual commit
 * is adapter work (later work-breakdown step).
 */

import { createHash } from "node:crypto";
import type { Descriptor } from "./types";
import { assertDescriptor, provenancePathFor } from "./descriptor";

export const PROVENANCE_SCHEMA = "continuous-research/provenance@v1";

export interface ProvenanceStub {
  schema: typeof PROVENANCE_SCHEMA;
  descriptor: Descriptor;
  /** Where the edition was obtained (URL / locator). */
  source: string;
  /** ISO-8601 timestamp of retrieval. */
  retrievedAt: string;
  /** Content hash, e.g. `sha256:<hex>` — guards against silent source drift. */
  hash: string;
}

export interface ProvenanceInput {
  descriptor: Descriptor;
  source: string;
  retrievedAt: string;
  hash: string;
}

/** Deterministic content hash, formatted `sha256:<hex>`. */
export function sha256(content: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

const HASH_RE = /^[a-z0-9]+:[0-9a-f]+$/;

function requireNonEmpty(value: string, field: string): string {
  const v = value.trim();
  if (v === "") throw new Error(`Provenance ${field} must not be empty`);
  return v;
}

function requireIsoDate(value: string, field: string): string {
  const v = requireNonEmpty(value, field);
  if (Number.isNaN(Date.parse(v))) {
    throw new Error(`Provenance ${field} must be an ISO-8601 date, got ${JSON.stringify(value)}`);
  }
  return v;
}

export function buildProvenanceStub(input: ProvenanceInput): ProvenanceStub {
  const descriptor = assertDescriptor(input.descriptor);
  const source = requireNonEmpty(input.source, "source");
  const hash = requireNonEmpty(input.hash, "hash");
  if (!HASH_RE.test(hash)) {
    throw new Error(`Provenance hash must look like "algo:hexdigest", got ${JSON.stringify(hash)}`);
  }
  const retrievedAt = requireIsoDate(input.retrievedAt, "retrievedAt");
  return { schema: PROVENANCE_SCHEMA, descriptor, source, retrievedAt, hash };
}

/** Stable, pretty-printed JSON with a trailing newline (a clean committed file). */
export function serializeProvenanceStub(stub: ProvenanceStub): string {
  return `${JSON.stringify(stub, null, 2)}\n`;
}

function readString(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  if (typeof v !== "string") throw new Error(`Provenance "${key}" must be a string`);
  return v;
}

/** Parse and re-validate a stub so reads enforce the same invariants as writes. */
export function parseProvenanceStub(json: string): ProvenanceStub {
  const data: unknown = JSON.parse(json);
  if (typeof data !== "object" || data === null) {
    throw new Error("Provenance stub must be a JSON object");
  }
  const obj = data as Record<string, unknown>;
  if (obj.schema !== PROVENANCE_SCHEMA) {
    throw new Error(`Unexpected provenance schema: ${JSON.stringify(obj.schema)}`);
  }
  return buildProvenanceStub({
    descriptor: readString(obj, "descriptor"),
    source: readString(obj, "source"),
    retrievedAt: readString(obj, "retrievedAt"),
    hash: readString(obj, "hash"),
  });
}

/** Convenience: the committed file's path + serialized content. */
export function provenanceFile(stub: ProvenanceStub): { path: string; content: string } {
  return { path: provenancePathFor(stub.descriptor), content: serializeProvenanceStub(stub) };
}

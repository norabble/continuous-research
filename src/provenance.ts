/**
 * Provenance stub (CONCEPT.md → "Provenance & storage").
 *
 * The always-committed lineage record for a descriptor, present on `main` even
 * when the bulk data is not stored — and therefore the durable "merged" marker
 * the dedup check reads. Pure builders / (de)serializers only; the actual commit
 * is adapter work (later work-breakdown step).
 *
 * The `@v2` shape carries the OKF-aligned trust families (CONCEPT.md → Interop,
 * Q-F): `sources` replaces the flat `source`, and `generated` / `verified`
 * record *who* produced and *who* confirmed an edition. `@v1` stubs still parse
 * (upcast in memory) and the file **path is unchanged**, so the dedup marker on
 * every already-merged edition keeps working — no instance migration.
 */

import { createHash } from "node:crypto";
import type { Descriptor } from "./types";
import { assertDescriptor, provenancePathFor } from "./descriptor";

export const PROVENANCE_SCHEMA_V1 = "continuous-research/provenance@v1";
export const PROVENANCE_SCHEMA_V2 = "continuous-research/provenance@v2";
/** The schema this build *writes*. Reads accept v1 as well. */
export const PROVENANCE_SCHEMA = PROVENANCE_SCHEMA_V2;

/**
 * One material an edition was obtained from. Maps to an OKF `sources[]` entry;
 * `hash` is a CR extension (OKF carries credibility signals but no integrity
 * field — see docs/okf-interop.md → Divergences).
 */
export interface ProvenanceSource {
  /** Stable key for per-claim attribution; defaults to the descriptor. */
  id: string;
  /** Where this material was obtained (URL / locator). */
  resource: string;
  title?: string;
  /** Date-only (`YYYY-MM-DD`), per OKF `last_modified`. */
  lastModified?: string;
  /** Content hash of this material, `algo:hexdigest`. */
  hash?: string;
}

/**
 * Who did something, and when. `by` follows the OKF actor grammar:
 * `human:<id>` | `process:<id>` | `<producer>/<version>`.
 */
export interface Actor {
  by: string;
  /** ISO-8601 timestamp. */
  at: string;
}

export interface ProvenanceStub {
  schema: typeof PROVENANCE_SCHEMA_V2;
  descriptor: Descriptor;
  /** At least one; the first is the primary locator. */
  sources: ProvenanceSource[];
  /** ISO-8601 timestamp of retrieval. */
  retrievedAt: string;
  /** Edition-level content hash, e.g. `sha256:<hex>` — guards against silent source drift. */
  hash: string;
  /** What produced this edition (CONCEPT.md Q-E: "how the judgment was made"). */
  generated?: Actor;
  /** Real confirmation events only — never synthesized (CONCEPT.md → Interop). */
  verified?: Actor[];
}

export interface ProvenanceSourceInput {
  id?: string;
  resource: string;
  title?: string;
  lastModified?: string;
  hash?: string;
}

export interface ProvenanceInput {
  descriptor: Descriptor;
  /** Legacy single-locator form; equivalent to a one-entry `sources`. */
  source?: string;
  /** Multi-source form; takes precedence over `source`. */
  sources?: ReadonlyArray<ProvenanceSourceInput>;
  retrievedAt: string;
  hash: string;
  generated?: Actor;
  verified?: ReadonlyArray<Actor>;
}

/** Deterministic content hash, formatted `sha256:<hex>`. */
export function sha256(content: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

const HASH_RE = /^[a-z0-9]+:[0-9a-f]+$/;
const SOURCE_ID_RE = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
/** OKF actor grammar: `human:<id>` | `process:<id>` | `<producer>/<version>`. */
const ACTOR_RE =
  /^(?:human:[A-Za-z0-9][\w.@+-]*|process:[A-Za-z0-9][\w.-]*|[A-Za-z0-9][\w.-]*\/[A-Za-z0-9][\w.-]*)$/;

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

function requireHash(value: string, field: string): string {
  const v = requireNonEmpty(value, field);
  if (!HASH_RE.test(v)) {
    throw new Error(
      `Provenance ${field} must look like "algo:hexdigest", got ${JSON.stringify(value)}`,
    );
  }
  return v;
}

function buildActor(input: Actor, field: string): Actor {
  const by = requireNonEmpty(input.by, `${field}.by`);
  if (!ACTOR_RE.test(by)) {
    throw new Error(
      `Provenance ${field}.by must be "human:<id>", "process:<id>", or "<producer>/<version>", ` +
        `got ${JSON.stringify(input.by)}`,
    );
  }
  return { by, at: requireIsoDate(input.at, `${field}.at`) };
}

function buildSources(input: ProvenanceInput, descriptor: Descriptor): ProvenanceSource[] {
  const raw: ProvenanceSourceInput[] =
    input.sources !== undefined && input.sources.length > 0
      ? [...input.sources]
      : input.source !== undefined
        ? [{ resource: input.source }]
        : [];
  if (raw.length === 0) {
    throw new Error('Provenance requires "source" or a non-empty "sources"');
  }

  const seen = new Set<string>();
  return raw.map((s, i) => {
    // A single unnamed source inherits the descriptor as its id, so the common
    // one-source case needs no ceremony; extra sources must name themselves.
    const id = s.id !== undefined ? requireNonEmpty(s.id, `sources[${i}].id`) : descriptor;
    if (!SOURCE_ID_RE.test(id)) {
      throw new Error(`Provenance sources[${i}].id is not a safe key: ${JSON.stringify(id)}`);
    }
    if (seen.has(id)) throw new Error(`Provenance sources[${i}].id is duplicated: ${id}`);
    seen.add(id);

    const out: ProvenanceSource = {
      id,
      resource: requireNonEmpty(s.resource, `sources[${i}].resource`),
    };
    if (s.title !== undefined) out.title = requireNonEmpty(s.title, `sources[${i}].title`);
    if (s.lastModified !== undefined) {
      const lm = requireNonEmpty(s.lastModified, `sources[${i}].lastModified`);
      if (!DATE_ONLY_RE.test(lm)) {
        throw new Error(
          `Provenance sources[${i}].lastModified must be YYYY-MM-DD, got ${JSON.stringify(s.lastModified)}`,
        );
      }
      out.lastModified = lm;
    }
    if (s.hash !== undefined) out.hash = requireHash(s.hash, `sources[${i}].hash`);
    return out;
  });
}

export function buildProvenanceStub(input: ProvenanceInput): ProvenanceStub {
  const descriptor = assertDescriptor(input.descriptor);
  const sources = buildSources(input, descriptor);
  const hash = requireHash(input.hash, "hash");
  const retrievedAt = requireIsoDate(input.retrievedAt, "retrievedAt");

  const stub: ProvenanceStub = {
    schema: PROVENANCE_SCHEMA_V2,
    descriptor,
    sources,
    retrievedAt,
    hash,
  };
  if (input.generated !== undefined) stub.generated = buildActor(input.generated, "generated");
  if (input.verified !== undefined) {
    stub.verified = input.verified.map((v, i) => buildActor(v, `verified[${i}]`));
  }
  return stub;
}

/**
 * A GitHub login as an OKF actor.
 *
 * A bot login (`foo[bot]`) becomes `process:foo`, never `human:`. OKF keys its
 * highest trust tier — *human-reviewed* — off a `human:<id>` verifier, so an
 * auto-merge must not be able to claim it: no person attended that event.
 */
export function actorForLogin(login: string): string {
  const name = requireNonEmpty(login, "login");
  const bot = /^(.+)\[bot\]$/.exec(name)?.[1];
  return bot === undefined ? `human:${name}` : `process:${bot}`;
}

/**
 * Append a verification to a stub, or return it **unchanged (same reference)**
 * when that exact `{by, at}` is already recorded — callers use the identity to
 * skip a pointless commit, and re-running the merge workflow must not stack
 * duplicate attestations.
 *
 * Deduping on the pair rather than on `by` is deliberate: the same person
 * verifying a later edition of the same descriptor is a real second event.
 */
export function withVerification(stub: ProvenanceStub, actor: Actor): ProvenanceStub {
  const entry = buildActor(actor, "verified");
  const existing = stub.verified ?? [];
  if (existing.some((v) => v.by === entry.by && v.at === entry.at)) return stub;
  return { ...stub, verified: [...existing, entry] };
}

/** The primary locator — the flat `source` of the v1 shape. */
export function primarySource(stub: ProvenanceStub): string {
  const first = stub.sources[0];
  // buildSources guarantees at least one entry; this keeps the type honest.
  if (first === undefined) throw new Error("Provenance stub has no sources");
  return first.resource;
}

/** Stable, pretty-printed JSON with a trailing newline (a clean committed file). */
export function serializeProvenanceStub(stub: ProvenanceStub): string {
  return `${JSON.stringify(stub, null, 2)}\n`;
}

function asObject(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Provenance ${what} must be an object`);
  }
  return value as Record<string, unknown>;
}

/** `label` names the field in errors; `key` is what we actually look up. */
function readString(obj: Record<string, unknown>, key: string, label: string = key): string {
  const v = obj[key];
  if (typeof v !== "string") throw new Error(`Provenance "${label}" must be a string`);
  return v;
}

function readOptionalString(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  if (v === undefined) return undefined;
  if (typeof v !== "string") throw new Error(`Provenance "${key}" must be a string`);
  return v;
}

function readActor(value: unknown, field: string): Actor {
  const o = asObject(value, `"${field}"`);
  return {
    by: readString(o, "by", `${field}.by`),
    at: readString(o, "at", `${field}.at`),
  };
}

function readSources(value: unknown): ProvenanceSourceInput[] {
  if (!Array.isArray(value)) throw new Error('Provenance "sources" must be an array');
  return (value as unknown[]).map((entry, i) => {
    const o = asObject(entry, `sources[${i}]`);
    const out: ProvenanceSourceInput = {
      resource: readString(o, "resource", `sources[${i}].resource`),
    };
    const id = readOptionalString(o, "id");
    if (id !== undefined) out.id = id;
    const title = readOptionalString(o, "title");
    if (title !== undefined) out.title = title;
    const lastModified = readOptionalString(o, "lastModified");
    if (lastModified !== undefined) out.lastModified = lastModified;
    const hash = readOptionalString(o, "hash");
    if (hash !== undefined) out.hash = hash;
    return out;
  });
}

/**
 * Parse and re-validate a stub so reads enforce the same invariants as writes.
 *
 * Accepts both schema versions: a `@v1` stub upcasts in memory (its flat
 * `source` becomes a single `sources` entry keyed by the descriptor), so stubs
 * already merged onto `main` keep parsing without being rewritten.
 */
export function parseProvenanceStub(json: string): ProvenanceStub {
  const data: unknown = JSON.parse(json);
  const obj = asObject(data, "stub");

  // Schema first: an unknown version must say so, not fail on a missing field.
  if (obj.schema !== PROVENANCE_SCHEMA_V1 && obj.schema !== PROVENANCE_SCHEMA_V2) {
    throw new Error(`Unexpected provenance schema: ${JSON.stringify(obj.schema)}`);
  }

  const common = {
    descriptor: readString(obj, "descriptor"),
    retrievedAt: readString(obj, "retrievedAt"),
    hash: readString(obj, "hash"),
  };

  if (obj.schema === PROVENANCE_SCHEMA_V1) {
    return buildProvenanceStub({ ...common, source: readString(obj, "source") });
  }

  const input: ProvenanceInput = { ...common, sources: readSources(obj.sources) };
  if (obj.generated !== undefined) input.generated = readActor(obj.generated, "generated");
  if (obj.verified !== undefined) {
    if (!Array.isArray(obj.verified)) throw new Error('Provenance "verified" must be an array');
    input.verified = (obj.verified as unknown[]).map((v, i) => readActor(v, `verified[${i}]`));
  }
  return buildProvenanceStub(input);
}

/** Convenience: the committed file's path + serialized content. */
export function provenanceFile(stub: ProvenanceStub): { path: string; content: string } {
  return { path: provenancePathFor(stub.descriptor), content: serializeProvenanceStub(stub) };
}

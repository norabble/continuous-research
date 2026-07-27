/**
 * YAML frontmatter for the OKF export (CONCEPT.md → Interop, Q-F).
 *
 * A thin wrapper over the `yaml` package that owns the conventions callers must
 * not have to think about: the `---` fence, canonical OKF key order, and
 * byte-stable output. Callers never import `yaml` directly.
 *
 * Why a library rather than the string-concatenation `decline.ts` uses: OKF
 * frontmatter carries agent- and source-authored values (`title` lifted from
 * live prose, `resource` URLs), and quoting — not structure — is where a
 * hand-rolled emitter fails quietly. `decline.ts` dodges this by keeping free
 * text out of frontmatter entirely; an OKF emitter cannot.
 *
 * Output is a build artifact that gets diffed, so emission must be
 * deterministic: `lineWidth: 0` (never soft-wrap a prose title) and a fixed key
 * order (known OKF keys first, custom keys after in insertion order).
 */

import { Scalar, parse, stringify } from "yaml";

export type FrontmatterData = Record<string, unknown>;

export interface ParsedDocument {
  data: FrontmatterData;
  /** Everything after the closing fence, with the leading blank line removed. */
  body: string;
}

const FENCE = "---";

/**
 * Canonical key order. OKF's own ordering (`type` first, then the descriptive
 * fields, then the trust families); anything else follows in insertion order.
 */
const KEY_ORDER = [
  "okf_version",
  "type",
  "title",
  "description",
  "resource",
  "tags",
  "sources",
  "generated",
  "verified",
  "status",
  "stale_after",
];

/**
 * Strings YAML 1.1 reads as booleans. We emit YAML 1.2 (where only
 * `true`/`false` are boolean), but OKF's reference implementation is Python and
 * PyYAML defaults to 1.1 — so a bare `yes` would cross the boundary as `True`.
 * Force-quote them; this is an interop fix, not a style preference.
 */
const YAML_11_BOOLEAN = /^(y|n|yes|no|on|off|true|false)$/i;

function harden(value: unknown): unknown {
  if (typeof value === "string" && YAML_11_BOOLEAN.test(value)) {
    const scalar = new Scalar(value);
    scalar.type = Scalar.QUOTE_DOUBLE;
    return scalar;
  }
  if (Array.isArray(value)) return value.map(harden);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, harden(v)]),
    );
  }
  return value;
}

function orderKeys(data: FrontmatterData): FrontmatterData {
  const known = KEY_ORDER.filter((k) => k in data);
  const custom = Object.keys(data).filter((k) => !KEY_ORDER.includes(k));
  const out: FrontmatterData = {};
  for (const key of [...known, ...custom]) out[key] = data[key];
  return out;
}

/** The `---` fenced block alone, ending in a newline. Empty data ⇒ empty string. */
export function formatFrontmatter(data: FrontmatterData): string {
  if (Object.keys(data).length === 0) return "";
  const body = stringify(harden(orderKeys(data)), { lineWidth: 0 });
  return `${FENCE}\n${body}${FENCE}\n`;
}

/**
 * A complete concept document: frontmatter, a blank line, then the markdown
 * body. Exactly one trailing newline, no CRLF — matching `decline.ts`.
 */
export function formatDocument(data: FrontmatterData, body: string): string {
  const trimmed = body.replace(/\s+$/, "");
  const front = formatFrontmatter(data);
  if (trimmed === "") return front;
  return front === "" ? `${trimmed}\n` : `${front}\n${trimmed}\n`;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/**
 * Split a document into frontmatter + body. A document with no frontmatter is
 * not an error — it parses as empty data plus the whole text as body, which is
 * what the conformance check needs in order to *report* a missing `type` rather
 * than throw on it.
 */
export function parseDocument(markdown: string): ParsedDocument {
  const match = FRONTMATTER_RE.exec(markdown);
  if (match === null) return { data: {}, body: markdown };
  const raw: unknown = parse(match[1] ?? "");
  if (raw !== null && (typeof raw !== "object" || Array.isArray(raw))) {
    throw new Error("frontmatter must be a YAML mapping");
  }
  return {
    data: (raw ?? {}) as FrontmatterData,
    body: markdown.slice(match[0].length).replace(/^\r?\n/, ""),
  };
}

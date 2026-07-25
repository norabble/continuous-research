/**
 * OKF bundle renderer (CONCEPT.md → Interop, Q-F; spec in docs/okf-interop.md).
 *
 * Pure: facts in, files out — no I/O, no clock (design rule 1). The bundle is a
 * *projection* of the instance's own record, never a second source of truth, so
 * everything here is derived from artifacts that already exist on `main`.
 *
 * The load-bearing rule is trust honesty: a signal is emitted only where a real
 * event backs it. Concretely, a finding gets `sources` only when its prose names
 * an edition — there is deliberately **no** "nearest edition" fallback, because
 * a guessed citation would travel into consumers that treat it as fact.
 */

import type { ProvenanceStub } from "./provenance";
import type { DeclineRecord } from "./decline";
import { parseAnnotations, type Annotation } from "./annotations";
import { formatDocument, type FrontmatterData } from "./frontmatter";

export interface OkfFile {
  /** Bundle-relative; the `_okf/` prefix is the CLI's business. */
  path: string;
  content: string;
}

export interface OkfFacts {
  title: string;
  description?: string;
  /** Parsed stubs of every accepted edition (i.e. present on the default branch). */
  editions: ProvenanceStub[];
  /** Parsed decline records — log entries only; declined editions are not concepts. */
  declines: DeclineRecord[];
  /** The living prose, or null when the instance has none yet. */
  findingsMd: string | null;
}

export const OKF_VERSION = "0.2";

/**
 * Claim ids are agent-authored and become file names, so they are validated
 * before they can reach a path. Same shape as a descriptor, plus uppercase.
 */
const SAFE_KEY_RE = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;
const HEADING_RE = /^(#{1,6})\s+(.*?)\s*$/;
const HR_RE = /^\s*(?:---|\*\*\*|___)\s*$/;
const ANNOTATION_RE = /^\s*<!--\s*claim:[\s\S]*?-->\s*$/;
const BACKTICKED_RE = /`([^`\n]+)`/g;

/** CR claim status (epistemic) → OKF status (lifecycle). Different axes; both are emitted. */
export function okfStatusFor(claimStatus: string): string {
  switch (claimStatus.trim().toLowerCase()) {
    case "overturned":
      return "deprecated";
    case "open":
      return "draft";
    default:
      // supported / weakened are both *current* claims — weakened is still standing.
      return "stable";
  }
}

interface FindingSection {
  annotation: Annotation;
  title: string;
  prose: string;
}

/**
 * Slice `findings.md` into one section per claim: the markdown heading block
 * containing the annotation. The heading text becomes the title. Tolerant —
 * an unannotated or heading-less document simply yields nothing.
 */
export function splitFindings(findingsMd: string): {
  sections: FindingSection[];
  preamble: string;
} {
  const index = parseAnnotations(findingsMd);
  const lines = findingsMd.split("\n");

  const headings = lines
    .map((line, i) => {
      const m = HEADING_RE.exec(line);
      return m ? { line: i, level: (m[1] as string).length, text: m[2] as string } : null;
    })
    .filter((h): h is { line: number; level: number; text: string } => h !== null);

  const sections: FindingSection[] = [];
  for (const annotation of index.byId.values()) {
    const at = annotation.line - 1; // parseAnnotations is 1-based
    const heading = [...headings].reverse().find((h) => h.line <= at);
    if (heading === undefined) continue;

    // A section ends at the next same-or-higher-level heading, or a horizontal
    // rule (which is how both live instances separate the trailing footer).
    let end = lines.length;
    for (let i = heading.line + 1; i < lines.length; i++) {
      const next = headings.find((h) => h.line === i);
      if ((next && next.level <= heading.level) || HR_RE.test(lines[i] as string)) {
        end = i;
        break;
      }
    }

    const prose = lines
      .slice(heading.line + 1, end)
      .filter((l) => !ANNOTATION_RE.test(l))
      .join("\n")
      .trim();
    sections.push({ annotation, title: heading.text, prose });
  }

  const firstHeading = headings[0];
  const preamble =
    firstHeading === undefined
      ? findingsMd.trim()
      : lines
          .slice(firstHeading.level === 1 ? firstHeading.line + 1 : 0, headings[1]?.line ?? 0)
          .filter((l) => !ANNOTATION_RE.test(l) && !HR_RE.test(l))
          .join("\n")
          .trim();

  return { sections, preamble };
}

/**
 * Editions a claim actually cites: backticked tokens in its prose that name a
 * known descriptor. Returns [] when the prose names none — the caller must then
 * omit `sources` entirely rather than substitute a guess.
 */
export function citedEditions(prose: string, known: ReadonlySet<string>): string[] {
  const found: string[] = [];
  for (const [, token] of prose.matchAll(BACKTICKED_RE)) {
    if (token !== undefined && known.has(token) && !found.includes(token)) found.push(token);
  }
  return found;
}

/** OKF `sources[]` for a stub: camelCase → snake_case, `hash` riding as a custom key. */
function okfSources(stub: ProvenanceStub): FrontmatterData[] {
  return stub.sources.map((s) => {
    const out: FrontmatterData = { id: s.id, resource: s.resource };
    if (s.title !== undefined) out.title = s.title;
    if (s.lastModified !== undefined) out.last_modified = s.lastModified;
    if (s.hash !== undefined) out.hash = s.hash;
    return out;
  });
}

function editionDoc(stub: ProvenanceStub): OkfFile {
  const data: FrontmatterData = {
    type: "Edition",
    title: `Edition ${stub.descriptor}`,
    description: `The ${stub.descriptor} edition, accepted into the instance's record.`,
    resource: stub.sources[0]?.resource ?? "",
    sources: okfSources(stub),
  };
  if (stub.generated !== undefined) data.generated = { ...stub.generated };
  // Only ever a real merge event; nothing here synthesizes one.
  if (stub.verified !== undefined) data.verified = stub.verified.map((v) => ({ ...v }));
  data.status = "stable";
  data.descriptor = stub.descriptor;
  data.retrieved_at = stub.retrievedAt;
  data.hash = stub.hash;

  const body = [
    `# Edition ${stub.descriptor}`,
    "",
    `Retrieved ${datePart(stub.retrievedAt)}. Content hash \`${stub.hash}\`.`,
    "",
    "## Materials",
    "",
    ...stub.sources.map((s) => `* [${s.title ?? s.id}](${s.resource})`),
  ].join("\n");

  return { path: `editions/${stub.descriptor}.md`, content: formatDocument(data, body) };
}

function findingDoc(section: FindingSection, byDescriptor: Map<string, ProvenanceStub>): OkfFile {
  const { annotation, title, prose } = section;
  const cited = citedEditions(prose, new Set(byDescriptor.keys()));

  const data: FrontmatterData = {
    type: "Finding",
    title,
    status: okfStatusFor(annotation.status),
  };
  if (cited.length > 0) {
    data.sources = cited.flatMap((d) => okfSources(byDescriptor.get(d) as ProvenanceStub));
  }
  // CR's epistemic axis and the claim's backing keys ride as custom keys — OKF
  // preserves unknown keys, and neither maps onto an OKF field.
  data.claim_status = annotation.status;
  data.backs = [...annotation.backs];
  data.claim_id = annotation.claimId;

  const cites =
    cited.length === 0
      ? []
      : ["", "## Editions cited", "", ...cited.map((d) => `* [Edition ${d}](../editions/${d}.md)`)];

  return {
    path: `findings/${annotation.claimId}.md`,
    content: formatDocument(data, [`# ${title}`, "", prose, ...cites].join("\n")),
  };
}

function datePart(iso: string): string {
  return iso.slice(0, 10);
}

interface LogEntry {
  date: string;
  text: string;
}

function logDoc(facts: OkfFacts): OkfFile {
  const entries: LogEntry[] = [
    ...facts.editions.map((e) => ({
      date: datePart(e.retrievedAt),
      text: `**Accepted** edition \`${e.descriptor}\` from ${e.sources[0]?.resource ?? "an unnamed source"}.`,
    })),
    ...facts.declines.map((d) => ({
      date: datePart(d.declinedAt),
      text: `**Declined** edition \`${d.descriptor}\`${d.reason === "" ? "." : ` — ${d.reason}`}`,
    })),
  ];

  const byDate = new Map<string, string[]>();
  for (const entry of entries) {
    const list = byDate.get(entry.date) ?? [];
    list.push(entry.text);
    byDate.set(entry.date, list);
  }

  const body = ["# Bundle history", ""];
  for (const date of [...byDate.keys()].sort().reverse()) {
    body.push(`## ${date}`, "");
    for (const text of byDate.get(date) as string[]) body.push(`- ${text}`);
    body.push("");
  }

  return {
    path: "log.md",
    content: formatDocument({ type: "Log", title: `${facts.title} — history` }, body.join("\n")),
  };
}

function indexDoc(
  facts: OkfFacts,
  findings: FindingSection[],
  editions: ProvenanceStub[],
): OkfFile {
  const { preamble } = facts.findingsMd
    ? splitFindings(facts.findingsMd)
    : { preamble: "" as string };

  const body = [`# ${facts.title}`, ""];
  if (facts.description) body.push(facts.description, "");
  if (preamble !== "") body.push(preamble, "");

  if (findings.length > 0) {
    body.push("## Findings", "");
    for (const f of findings) {
      body.push(`* [${f.title}](findings/${f.annotation.claimId}.md) - ${f.annotation.status}`);
    }
    body.push("");
  }
  if (editions.length > 0) {
    body.push("## Editions", "");
    for (const e of editions) {
      body.push(
        `* [Edition ${e.descriptor}](editions/${e.descriptor}.md) - retrieved ${datePart(e.retrievedAt)}`,
      );
    }
    body.push("");
  }
  body.push("## History", "", "* [Bundle history](log.md) - accepted and declined editions");

  // §12: a bundle-root index.md is the only place frontmatter is permitted,
  // and `okf_version` is the only key allowed in it.
  return {
    path: "index.md",
    content: formatDocument({ okf_version: OKF_VERSION }, body.join("\n")),
  };
}

export function buildOkfBundle(facts: OkfFacts): OkfFile[] {
  // Newest first everywhere the order is visible to a reader.
  const editions = [...facts.editions].sort((a, b) => b.retrievedAt.localeCompare(a.retrievedAt));
  const byDescriptor = new Map(editions.map((e) => [e.descriptor, e]));

  const sections = facts.findingsMd ? splitFindings(facts.findingsMd).sections : [];
  // Claim ids become file names; an unsafe one is dropped rather than allowed to
  // escape the bundle directory.
  const safe = sections.filter((s) => SAFE_KEY_RE.test(s.annotation.claimId));

  return [
    indexDoc(facts, safe, editions),
    logDoc(facts),
    ...safe.map((s) => findingDoc(s, byDescriptor)),
    ...editions.map(editionDoc),
  ];
}

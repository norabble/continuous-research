/**
 * Site translation table + index/detail page renderer.
 *
 * Pure presentation layer for the read-only research site: no I/O, no
 * `Date.now()` — `generatedAt` arrives injected so output is deterministic.
 * `COPY` is the entire site-facing vocabulary; no other user-facing string
 * may be invented outside it (CONCEPT.md → readers who understand research
 * but not GitHub). Markdown fields (findings, impact bodies/excerpts) are
 * untrusted agent-written content and only ever become HTML via
 * `renderUntrustedMarkdown` (src/site-md.ts) — the security boundary. Every
 * other interpolated string is still escaped locally, in depth.
 *
 * Index sections are ordered header -> findings -> pending -> maintenance
 * (2026-07-06 prototype review: findings before pending). The pending-card
 * excerpt shows the first 5 lines of the impact markdown source as rendered
 * block HTML, with any remainder tucked into a native `<details>` disclosure
 * (no JavaScript) — see `renderImpactExcerpt`. `renderSite` also emits one
 * `updates/<descriptor>.html` detail page per pending update.
 */

import type { ProvenanceStub } from "./provenance";
import { isSafeHref, renderUntrustedMarkdown } from "./site-md";

export interface PendingUpdate {
  descriptor: string;
  proposedAt: string; // ISO-8601
  impactMd: string | null; // null => "assessment in progress"
  provenance: ProvenanceStub | null;
  githubUrl: string;
}

export interface MaintenanceItem {
  title: string;
  githubUrl: string;
}

export interface SiteData {
  title: string;
  description?: string;
  generatedAt: string; // injected, ISO-8601
  findingsMd: string | null; // null => section omitted
  updates: PendingUpdate[];
  maintenance: MaintenanceItem[];
  // "owner/repo", or null to leave relative markdown links/images untouched
  // (see renderUntrustedMarkdown's repoSlug option, src/site-md.ts).
  repoSlug: string | null;
}

export interface SiteFile {
  path: string;
  content: string;
}

/** The translation strings, one place — the entire site-facing vocabulary. */
export const COPY = {
  tagline: "A living research project: findings update as new evidence arrives and passes review.",
  pendingHeading: "Updates pending review",
  pendingEmpty: "No updates pending review — findings are current.",
  awaiting: "Awaiting the author's review",
  assessmentPending: "Assessment in progress",
  whatChanges: "What this changes",
  evidence: "Evidence record",
  findingsHeading: "Current findings",
  maintenanceHeading: "Maintenance",
  maintenanceNote: "The project keeping its instruments calibrated.",
  editionLabel: "Edition",
  githubLink: "View the underlying proposal on GitHub",
  reviewNote: "Updates become part of the findings only after the author's review.",
  updatedPrefix: "Last updated",
  expandHint: "Show the full assessment",
  evidenceSource: "Source",
  evidenceRetrieved: "Retrieved",
  evidenceHash: "Hash",
} as const;

// Same entity escaping as site-md's escapeHtml, applied to every
// interpolated string outside the renderUntrustedMarkdown path — defense in
// depth even where the source is already known-safe (e.g. assertDescriptor-
// validated descriptors), and load-bearing where it isn't (titles,
// descriptions, maintenance item text, which are project/agent-authored).
function escapeText(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Scheme-validates a URL (protecting against javascript:, data:, vbscript:,
// protocol-relative //, and other hostile schemes) and escapes it for safe
// use in href attributes. Returns "#" for unsafe schemes.
function safeHrefAttr(url: string): string {
  return escapeText(isSafeHref(url) ? url : "#");
}

/** The date portion of an ISO-8601 timestamp, e.g. "2026-07-06T12:00:00Z" -> "2026-07-06". */
function datePart(iso: string): string {
  return iso.slice(0, 10);
}

// Mirrors the annotation-line stripping renderUntrustedMarkdown performs
// (src/site-md.ts's ANNOTATION_LINE) so the source we split matches what the
// renderer will actually show — annotation lines are structure for the
// claim index, not content. (The stripped line collapses to a blank line
// rather than disappearing, so it can still occupy one of the 5 slots; that
// matches renderUntrustedMarkdown's own behavior and is within the spec's
// deterministic-split tolerance.) This duplicates only the
// (non-security-critical) regex; the escaping itself still happens exactly
// once, inside renderUntrustedMarkdown, per each half below.
const ANNOTATION_LINE = /^[ \t]*<!--\s*claim:[\s\S]*?-->[ \t]*$/gm;

const EXCERPT_LINES = 5;

// Renders untrusted markdown with the site's repoSlug (if any) threaded
// through, so relative link/image destinations resolve against GitHub
// instead of the Pages origin. `sourceDir` is the repo-relative directory
// the source markdown lives in (see RenderOptions, src/site-md.ts) — "" for
// findings.md (repo root), ".research/impact" for impact bodies/excerpts.
function renderMd(src: string, repoSlug: string | null, sourceDir: string): string {
  return renderUntrustedMarkdown(src, repoSlug ? { repoSlug, sourceDir } : {});
}

/** Splits annotation-stripped markdown source into a head (first N lines) and an optional remainder. */
function splitImpactSource(md: string): { headMd: string; restMd: string | null } {
  const stripped = md.replace(ANNOTATION_LINE, "");
  const lines = stripped.split("\n");
  if (lines.length <= EXCERPT_LINES) return { headMd: stripped, restMd: null };
  return {
    headMd: lines.slice(0, EXCERPT_LINES).join("\n"),
    restMd: lines.slice(EXCERPT_LINES).join("\n"),
  };
}

// First 5 lines of the impact markdown, rendered as block HTML. When more
// remains, the remainder is tucked behind a native <details> disclosure —
// its "…" <summary> IS the active ellipsis, no JavaScript required. A
// markdown construct that happens to straddle the line-5 boundary (e.g. a
// list) may render as two fragments; acceptable per spec (deterministic
// line-splitting beats clever segmentation).
function renderImpactExcerpt(md: string, repoSlug: string | null): string {
  const { headMd, restMd } = splitImpactSource(md);
  const head = renderMd(headMd, repoSlug, ".research/impact");
  if (restMd === null) return head;
  const hint = escapeText(COPY.expandHint);
  return `${head}<details class="impact-more"><summary aria-label="${hint}" title="${hint}">…</summary>${renderMd(restMd, repoSlug, ".research/impact")}</details>`;
}

function renderUpdateCard(update: PendingUpdate, repoSlug: string | null): string {
  const body = update.impactMd
    ? renderImpactExcerpt(update.impactMd, repoSlug)
    : `<p>${COPY.assessmentPending}</p>`;
  const descriptor = escapeText(update.descriptor);
  return `
    <article class="card">
      <h3>${COPY.editionLabel} ${descriptor}</h3>
      <p class="meta">${escapeText(datePart(update.proposedAt))} — <span class="badge">${COPY.awaiting}</span></p>
      <div class="impact">${body}</div>
      <p><a href="updates/${descriptor}.html">${COPY.editionLabel} ${descriptor}</a></p>
    </article>`;
}

function renderPendingSection(updates: PendingUpdate[], repoSlug: string | null): string {
  const body =
    updates.length === 0
      ? `<p class="empty">${COPY.pendingEmpty}</p>`
      : `<div class="cards">${updates.map((update) => renderUpdateCard(update, repoSlug)).join("")}</div>`;
  return `
  <section class="pending">
    <h2>${COPY.pendingHeading}</h2>
    ${body}
    <p class="note">${COPY.reviewNote}</p>
  </section>`;
}

function renderFindingsSection(findingsMd: string | null, repoSlug: string | null): string {
  if (findingsMd === null) return "";
  return `
  <section class="findings">
    <h2>${COPY.findingsHeading}</h2>
    ${renderMd(findingsMd, repoSlug, "")}
  </section>`;
}

function renderMaintenanceItem(item: MaintenanceItem): string {
  return `<li>${escapeText(item.title)} — <a href="${safeHrefAttr(item.githubUrl)}">${COPY.githubLink}</a></li>`;
}

function renderMaintenanceSection(maintenance: MaintenanceItem[]): string {
  if (maintenance.length === 0) return "";
  return `
  <section class="maintenance">
    <h2>${COPY.maintenanceHeading}</h2>
    <p class="note">${COPY.maintenanceNote}</p>
    <ul>${maintenance.map(renderMaintenanceItem).join("")}</ul>
  </section>`;
}

// `indexHref`, when given, wraps the title in a link back to the index —
// used by detail pages (`../index.html`) so they share this exact header
// rather than inventing separate "back" copy outside COPY.
function renderHeader(data: SiteData, indexHref?: string): string {
  const description = data.description
    ? `<p class="description">${escapeText(data.description)}</p>`
    : "";
  const titleText = escapeText(data.title);
  const title = indexHref ? `<a href="${escapeText(indexHref)}">${titleText}</a>` : titleText;
  return `
  <header>
    <h1>${title}</h1>
    ${description}
    <p class="tagline">${COPY.tagline}</p>
    <p class="updated">${COPY.updatedPrefix} ${escapeText(datePart(data.generatedAt))}</p>
  </header>`;
}

function renderIndex(data: SiteData): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeText(data.title)}</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <main>${renderHeader(data)}${renderFindingsSection(data.findingsMd, data.repoSlug)}${renderPendingSection(data.updates, data.repoSlug)}${renderMaintenanceSection(data.maintenance)}
  </main>
</body>
</html>
`;
}

function renderProvenanceSection(provenance: ProvenanceStub | null): string {
  if (provenance === null) return "";
  return `
    <section class="evidence">
      <h3>${COPY.evidence}</h3>
      <dl>
        <dt>${COPY.evidenceSource}</dt>
        <dd><a href="${safeHrefAttr(provenance.source)}">${escapeText(provenance.source)}</a></dd>
        <dt>${COPY.evidenceRetrieved}</dt>
        <dd>${escapeText(datePart(provenance.retrievedAt))}</dd>
        <dt>${COPY.evidenceHash}</dt>
        <dd><code>${escapeText(provenance.hash)}</code></dd>
      </dl>
    </section>`;
}

function renderImpactSection(impactMd: string | null, repoSlug: string | null): string {
  const body = impactMd
    ? renderMd(impactMd, repoSlug, ".research/impact")
    : `<p>${COPY.assessmentPending}</p>`;
  return `
    <section class="impact">
      <h3>${COPY.whatChanges}</h3>
      ${body}
    </section>`;
}

// Detail page for a single pending update: full impact body (not the
// index's 5-line excerpt) + evidence record + a single outbound GitHub
// link. Lives one directory down from the index, hence the relative
// "../style.css" stylesheet and the "../index.html" back-link threaded
// through `renderHeader`.
function renderUpdatePage(update: PendingUpdate, data: SiteData): string {
  const descriptor = escapeText(update.descriptor);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${COPY.editionLabel} ${descriptor} — ${escapeText(data.title)}</title>
  <link rel="stylesheet" href="../style.css" />
</head>
<body>
  <main>${renderHeader(data, "../index.html")}
  <article>
    <h2>${COPY.editionLabel} ${descriptor}</h2>
    <p class="meta">${escapeText(datePart(update.proposedAt))} — <span class="badge">${COPY.awaiting}</span></p>
    ${renderImpactSection(update.impactMd, data.repoSlug)}
    ${renderProvenanceSection(update.provenance)}
    <p class="note">${COPY.reviewNote}</p>
    <p><a href="${safeHrefAttr(update.githubUrl)}">${COPY.githubLink}</a></p>
  </article>
  </main>
</body>
</html>
`;
}

const STYLE = `:root {
  color-scheme: light dark;
  --bg: #ffffff;
  --fg: #1a1a1a;
  --muted: #6b6b6b;
  --border: #d8d8d8;
  --card-bg: #fafafa;
  --link: #0b5fa5;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #14161a;
    --fg: #e8e8e8;
    --muted: #9a9a9a;
    --border: #33363c;
    --card-bg: #1b1e23;
    --link: #6cb4f5;
  }
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  padding: 2rem 1rem;
  background: var(--bg);
  color: var(--fg);
  font-family:
    system-ui,
    -apple-system,
    "Segoe UI",
    Roboto,
    Helvetica,
    Arial,
    sans-serif;
  line-height: 1.5;
}

main {
  max-width: 42rem;
  margin: 0 auto;
}

header {
  margin-bottom: 2rem;
}

h1 {
  margin: 0 0 0.5rem;
  font-size: 1.75rem;
}

h2 {
  font-size: 1.25rem;
  margin-top: 2rem;
}

.tagline {
  color: var(--muted);
}

.updated {
  color: var(--muted);
  font-size: 0.875rem;
}

a {
  color: var(--link);
}

.cards {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.card {
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  padding: 1rem;
  background: var(--card-bg);
}

.card h3 {
  margin: 0 0 0.25rem;
  font-size: 1rem;
}

.meta {
  color: var(--muted);
  font-size: 0.875rem;
  margin: 0 0 0.5rem;
}

.badge {
  display: inline-block;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0.1rem 0.6rem;
  font-size: 0.75rem;
  color: var(--muted);
}

.empty,
.note {
  color: var(--muted);
  font-size: 0.9rem;
}

.maintenance {
  color: var(--muted);
}

.maintenance h2 {
  color: var(--fg);
}

.maintenance ul {
  padding-left: 1.25rem;
}

header h1 a {
  color: inherit;
  text-decoration: none;
}

article h2,
article h3 {
  margin-top: 1.5rem;
}

.impact {
  margin: 0.5rem 0;
}

/* The "…" summary is the active ellipsis for the impact-excerpt overflow —
   no JavaScript, native <details>. Hide the default disclosure triangle so
   the "…" itself reads as the clickable affordance. */
details.impact-more {
  margin-top: 0.25rem;
}

details.impact-more > summary {
  cursor: pointer;
  display: inline-block;
  color: var(--link);
  list-style: none;
}

details.impact-more > summary::-webkit-details-marker {
  display: none;
}

details.impact-more > summary::marker {
  content: "";
}

details.impact-more > summary:hover {
  text-decoration: underline;
}

details.impact-more[open] > summary {
  margin-bottom: 0.5rem;
}

.evidence dl {
  margin: 0;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.25rem 0.75rem;
}

.evidence dt {
  color: var(--muted);
  font-size: 0.875rem;
}

.evidence dd {
  margin: 0;
  word-break: break-all;
}

.evidence code {
  font-size: 0.85em;
}
`;

export function renderSite(data: SiteData): SiteFile[] {
  return [
    { path: "index.html", content: renderIndex(data) },
    { path: "style.css", content: STYLE },
    ...data.updates.map((update) => ({
      path: `updates/${update.descriptor}.html`,
      content: renderUpdatePage(update, data),
    })),
  ];
}

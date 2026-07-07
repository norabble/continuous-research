/**
 * Site translation table + index page renderer.
 *
 * Pure presentation layer for the read-only research site: no I/O, no
 * `Date.now()` — `generatedAt` arrives injected so output is deterministic.
 * `COPY` is the entire site-facing vocabulary; no other user-facing string
 * may be invented outside it (CONCEPT.md → readers who understand research
 * but not GitHub). Markdown fields (findings, impact excerpts) are untrusted
 * agent-written content and only ever become HTML via
 * `renderUntrustedMarkdown` (src/site-md.ts) — the security boundary. Every
 * other interpolated string is still escaped locally, in depth.
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

// Renders untrusted markdown to HTML, then strips tags down to plain text
// and collapses whitespace -- used only to build the ~40-word excerpt.
// Going through renderUntrustedMarkdown first (rather than reducing the
// markdown source directly) guarantees no raw HTML can survive into the
// excerpt, the same safety contract as everywhere else markdown appears.
function plainTextFrom(md: string): string {
  const html = renderUntrustedMarkdown(md);
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const EXCERPT_WORDS = 40;

/** First ~40 words of markdown reduced to plain text, with a trailing "…" when truncated. */
function impactExcerpt(md: string): string {
  const words = plainTextFrom(md).split(" ").filter(Boolean);
  const truncated = words.length > EXCERPT_WORDS;
  const excerpt = words.slice(0, EXCERPT_WORDS).join(" ");
  return truncated ? `${excerpt}…` : excerpt;
}

function renderUpdateCard(update: PendingUpdate): string {
  const excerpt = update.impactMd
    ? escapeText(impactExcerpt(update.impactMd))
    : COPY.assessmentPending;
  const descriptor = escapeText(update.descriptor);
  return `
    <article class="card">
      <h3>${COPY.editionLabel} ${descriptor}</h3>
      <p class="meta">${escapeText(datePart(update.proposedAt))} — <span class="badge">${COPY.awaiting}</span></p>
      <p>${excerpt}</p>
      <p><a href="updates/${descriptor}.html">${COPY.editionLabel} ${descriptor}</a></p>
    </article>`;
}

function renderPendingSection(updates: PendingUpdate[]): string {
  const body =
    updates.length === 0
      ? `<p class="empty">${COPY.pendingEmpty}</p>`
      : `<div class="cards">${updates.map(renderUpdateCard).join("")}</div>`;
  return `
  <section class="pending">
    <h2>${COPY.pendingHeading}</h2>
    ${body}
    <p class="note">${COPY.reviewNote}</p>
  </section>`;
}

function renderFindingsSection(findingsMd: string | null): string {
  if (findingsMd === null) return "";
  return `
  <section class="findings">
    <h2>${COPY.findingsHeading}</h2>
    ${renderUntrustedMarkdown(findingsMd)}
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

function renderHeader(data: SiteData): string {
  const description = data.description
    ? `<p class="description">${escapeText(data.description)}</p>`
    : "";
  return `
  <header>
    <h1>${escapeText(data.title)}</h1>
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
  <main>${renderHeader(data)}${renderPendingSection(data.updates)}${renderFindingsSection(data.findingsMd)}${renderMaintenanceSection(data.maintenance)}
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
`;

export function renderSite(data: SiteData): SiteFile[] {
  return [
    { path: "index.html", content: renderIndex(data) },
    { path: "style.css", content: STYLE },
  ];
}

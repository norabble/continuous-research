import { describe, expect, it } from "vitest";
import { renderSite, COPY, type SiteData } from "./site-render";

const base: SiteData = {
  title: "BTC-USD, continuously",
  generatedAt: "2026-07-06T12:00:00Z",
  findingsMd: "# Findings\n\nPrice is above its 7-day average.",
  updates: [],
  maintenance: [],
};
const index = (d: SiteData) => renderSite(d).find((f) => f.path === "index.html")!.content;

describe("renderSite index", () => {
  it("emits index.html and style.css", () => {
    expect(renderSite(base).map((f) => f.path)).toEqual(
      expect.arrayContaining(["index.html", "style.css"]),
    );
  });
  it("shows the empty state when nothing is pending", () => {
    expect(index(base)).toContain(COPY.pendingEmpty);
  });
  it("renders a pending update card, translated", () => {
    const html = index({
      ...base,
      updates: [
        {
          descriptor: "btcusd-2026-07-06",
          proposedAt: "2026-07-05T00:30:00Z",
          impactMd: "## Assessment\n\n**Strengthened.**",
          provenance: null,
          githubUrl: "https://github.com/o/r/pull/9",
        },
      ],
    });
    expect(html).toContain(`${COPY.editionLabel} btcusd-2026-07-06`);
    expect(html).toContain(COPY.awaiting);
    expect(html).toContain("Strengthened");
    expect(html).toContain('href="updates/btcusd-2026-07-06.html"');
    expect(html).not.toContain("pull/9"); // no GitHub chrome on index
    expect(html).not.toMatch(/\bPR\b|pull request/i);
  });
  it("marks updates without an impact declaration as in progress", () => {
    const html = index({
      ...base,
      updates: [
        {
          descriptor: "d1",
          proposedAt: "2026-07-05T00:00:00Z",
          impactMd: null,
          provenance: null,
          githubUrl: "u",
        },
      ],
    });
    expect(html).toContain(COPY.assessmentPending);
  });
  it("renders findings and omits the section when absent", () => {
    expect(index(base)).toContain("7-day average");
    expect(index({ ...base, findingsMd: null })).not.toContain(COPY.findingsHeading);
  });
  it("lists maintenance quietly with a GitHub link", () => {
    const html = index({
      ...base,
      maintenance: [{ title: "re-point sensor to www.bitstamp.net", githubUrl: "https://g/x" }],
    });
    expect(html).toContain(COPY.maintenanceHeading);
    expect(html).toContain('href="https://g/x"');
  });

  it("scheme-validates maintenance item URLs, neutralizing javascript: to #", () => {
    const html = index({
      ...base,
      maintenance: [{ title: "test item", githubUrl: "javascript:alert(1)" }],
    });
    expect(html).toContain('href="#"');
    expect(html).not.toContain("javascript:");
  });
  it("escapes hostile content arriving via markdown fields", () => {
    const html = index({ ...base, findingsMd: "<script>alert(1)</script>" });
    expect(html).not.toContain("<script>");
  });

  it("escapes hostile content arriving via the impact-excerpt path", () => {
    const html = index({
      ...base,
      updates: [
        {
          descriptor: "d4",
          proposedAt: "2026-07-05T00:00:00Z",
          impactMd: "<script>alert(1)</script>",
          provenance: null,
          githubUrl: "u",
        },
      ],
    });
    expect(html).not.toContain("<script");
  });

  // --- Additional coverage beyond the brief's tests ---

  it("escapes hostile content in the title and description", () => {
    const html = index({
      ...base,
      title: "<script>alert(1)</script>",
      description: "<img src=x onerror=alert(2)>",
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
  });

  it("escapes hostile content in a maintenance item's title", () => {
    const html = index({
      ...base,
      maintenance: [{ title: "<script>alert(1)</script>", githubUrl: "https://g/x" }],
    });
    expect(html).not.toContain("<script>");
  });

  it("omits the maintenance section entirely when there is nothing to maintain", () => {
    expect(index(base)).not.toContain(COPY.maintenanceHeading);
  });

  it("renders the optional description when present, and omits it when absent", () => {
    const withDescription = index({ ...base, description: "Tracks a daily close." });
    expect(withDescription).toContain("Tracks a daily close.");
    expect(index(base)).not.toContain("undefined");
  });

  it("shows the date portion of generatedAt, prefixed", () => {
    expect(index(base)).toContain(`${COPY.updatedPrefix} 2026-07-06`);
  });

  it("truncates a long impact excerpt to ~40 words with an ellipsis", () => {
    const long = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ");
    const html = index({
      ...base,
      updates: [
        {
          descriptor: "d2",
          proposedAt: "2026-07-05T00:00:00Z",
          impactMd: long,
          provenance: null,
          githubUrl: "u",
        },
      ],
    });
    expect(html).toContain("word0 word1");
    expect(html).not.toContain("word79");
    expect(html).toMatch(/…/);
  });

  it("does not truncate a short impact excerpt (no trailing ellipsis added)", () => {
    const html = index({
      ...base,
      updates: [
        {
          descriptor: "d3",
          proposedAt: "2026-07-05T00:00:00Z",
          impactMd: "Short and sweet.",
          provenance: null,
          githubUrl: "u",
        },
      ],
    });
    expect(html).toContain("Short and sweet.");
    expect(html).not.toMatch(/…/);
  });

  it("never emits a <script> tag anywhere in the index or stylesheet", () => {
    const files = renderSite(base);
    for (const f of files) {
      expect(f.content).not.toContain("<script");
    }
  });

  it("includes the tagline and review note copy", () => {
    expect(index(base)).toContain(COPY.tagline);
    expect(index(base)).toContain(COPY.reviewNote);
  });
});

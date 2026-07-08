import { describe, expect, it } from "vitest";
import { renderSite, COPY, type SiteData, type PendingUpdate } from "./site-render";

const base: SiteData = {
  title: "BTC-USD, continuously",
  generatedAt: "2026-07-06T12:00:00Z",
  findingsMd: "# Findings\n\nPrice is above its 7-day average.",
  updates: [],
  maintenance: [],
  repoSlug: null,
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
  it("rewrites relative findings links against the repo", () => {
    const files = renderSite({
      ...base,
      repoSlug: "norabble/continuous-research-sample",
      findingsMd: "[the sensor](./sensor.mjs)",
    });
    const index = files.find((f) => f.path === "index.html")!;
    expect(index.content).toContain(
      'href="https://github.com/norabble/continuous-research-sample/blob/HEAD/sensor.mjs"',
    );
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

// --- Part A: maintainer feedback from the 2026-07-06 prototype gate ---

describe("renderSite index — findings before pending (maintainer feedback)", () => {
  it("orders sections findings before pending updates on the index", () => {
    const html = index(base); // base has findingsMd set, so the section is present
    expect(html.indexOf(COPY.findingsHeading)).toBeGreaterThan(-1);
    expect(html.indexOf(COPY.pendingHeading)).toBeGreaterThan(-1);
    expect(html.indexOf(COPY.findingsHeading)).toBeLessThan(html.indexOf(COPY.pendingHeading));
  });
});

describe("renderSite index — 5-line expandable impact excerpt (maintainer feedback)", () => {
  it("splits an impact longer than 5 lines: first 5 lines outside <details>, remainder inside, exactly one <summary>", () => {
    const impactMd = [
      "Para one line A.",
      "Para one line B.",
      "",
      "Para two line A.",
      "Para two line B.",
      "",
      "Para three - hidden in the details.",
    ].join("\n");
    const html = index({
      ...base,
      updates: [
        {
          descriptor: "d6",
          proposedAt: "2026-07-05T00:00:00Z",
          impactMd,
          provenance: null,
          githubUrl: "u",
        },
      ],
    });
    const detailsIndex = html.indexOf("<details");
    expect(detailsIndex).toBeGreaterThan(-1);
    expect(html.indexOf("Para one line A")).toBeLessThan(detailsIndex);
    expect(html.indexOf("Para two line B")).toBeLessThan(detailsIndex);
    expect(html.indexOf("Para three - hidden")).toBeGreaterThan(detailsIndex);
    expect(html.match(/<summary/g)).toHaveLength(1);
    expect(html).toContain(COPY.expandHint);
  });

  it("does not wrap a 3-line impact in <details> (short content shows whole, no ellipsis marker)", () => {
    const impactMd = "Line one.\nLine two.\nLine three.";
    const html = index({
      ...base,
      updates: [
        {
          descriptor: "d7",
          proposedAt: "2026-07-05T00:00:00Z",
          impactMd,
          provenance: null,
          githubUrl: "u",
        },
      ],
    });
    expect(html).toContain("Line one.");
    expect(html).not.toContain("<details");
    expect(html).not.toContain(COPY.expandHint);
  });

  it("escapes hostile content in both the visible excerpt and the details remainder", () => {
    const impactMd = [
      "<script>alert('head')</script>",
      "line 2",
      "line 3",
      "line 4",
      "line 5",
      "<script>alert('tail')</script>",
    ].join("\n");
    const html = index({
      ...base,
      updates: [
        {
          descriptor: "d8",
          proposedAt: "2026-07-05T00:00:00Z",
          impactMd,
          provenance: null,
          githubUrl: "u",
        },
      ],
    });
    expect(html).not.toContain("<script");
    const detailsIdx = html.indexOf("<details");
    expect(detailsIdx).toBeGreaterThan(-1);
    const occurrences = html.match(/&lt;script&gt;/g);
    expect(occurrences).toHaveLength(2);
    expect(html.indexOf("&lt;script&gt;")).toBeLessThan(detailsIdx);
    expect(html.lastIndexOf("&lt;script&gt;")).toBeGreaterThan(detailsIdx);
  });

  it("preserves paragraph breaks from the impact markdown as block HTML, not flattened text", () => {
    const impactMd = "Para one.\n\nPara two.\n\nPara three.";
    const html = index({
      ...base,
      findingsMd: null, // isolate the count from the findings section's own <p>
      updates: [
        {
          descriptor: "d5",
          proposedAt: "2026-07-05T00:00:00Z",
          impactMd,
          provenance: null,
          githubUrl: "u",
        },
      ],
    });
    const impactDiv = /<div class="impact">([\s\S]*?)<\/div>/.exec(html)![1]!;
    expect(impactDiv.match(/<p>/g)).toHaveLength(3);
    expect(html).not.toContain("<details");
  });
});

// --- Part B: per-update detail pages ---

describe("renderSite update detail pages", () => {
  const T = "2026-07-05T00:00:00Z";
  const upd = (descriptor: string): PendingUpdate => ({
    descriptor,
    proposedAt: T,
    impactMd: null,
    provenance: null,
    githubUrl: "https://g/pull/1",
  });

  it("emits a detail page per pending update", () => {
    const files = renderSite({ ...base, updates: [upd("d1"), upd("d2")] });
    expect(files.map((f) => f.path)).toEqual(
      expect.arrayContaining(["updates/d1.html", "updates/d2.html"]),
    );
  });

  it("detail page: impact body, evidence record, review note, one GitHub link", () => {
    const page = renderSite({
      ...base,
      updates: [
        {
          descriptor: "d1",
          proposedAt: T,
          githubUrl: "https://g/pull/9",
          impactMd: "## Assessment\n\nOverturned.",
          provenance: {
            schema: "continuous-research/provenance@v1",
            descriptor: "d1",
            source: "https://src.example/x",
            retrievedAt: "2026-07-05T00:00:00Z",
            hash: "sha256:abcd",
          },
        },
      ],
    }).find((f) => f.path === "updates/d1.html")!.content;
    expect(page).toContain(COPY.whatChanges);
    expect(page).toContain("Overturned");
    expect(page).toContain(COPY.evidence);
    expect(page).toContain("https://src.example/x");
    expect(page).toContain("sha256:abcd");
    expect(page).toContain(COPY.reviewNote);
    expect(page.match(/https:\/\/g\/pull\/9/g)).toHaveLength(1);
  });

  it("detail page without impact shows the in-progress state; evidence still shown when provenance exists", () => {
    const page = renderSite({
      ...base,
      updates: [
        {
          descriptor: "d3",
          proposedAt: T,
          githubUrl: "https://g/pull/10",
          impactMd: null,
          provenance: {
            schema: "continuous-research/provenance@v1",
            descriptor: "d3",
            source: "https://src.example/z",
            retrievedAt: "2026-07-04T00:00:00Z",
            hash: "sha256:efgh",
          },
        },
      ],
    }).find((f) => f.path === "updates/d3.html")!.content;
    expect(page).toContain(COPY.assessmentPending);
    expect(page).toContain(COPY.evidence);
    expect(page).toContain(COPY.evidenceSource);
    expect(page).toContain(COPY.evidenceRetrieved);
    expect(page).toContain(COPY.evidenceHash);
    expect(page).toContain("https://src.example/z");
    expect(page).toContain("sha256:efgh");
  });

  it("detail page has no evidence section when provenance is absent", () => {
    const page = renderSite({ ...base, updates: [upd("d4")] }).find(
      (f) => f.path === "updates/d4.html",
    )!.content;
    expect(page).not.toContain(COPY.evidence);
  });

  it("detail page links back to ../index.html and the stylesheet at ../style.css", () => {
    const page = renderSite({ ...base, updates: [upd("d1")] }).find(
      (f) => f.path === "updates/d1.html",
    )!.content;
    expect(page).toContain('href="../index.html"');
    expect(page).toContain('href="../style.css"');
  });

  it("escapes hostile content on the detail page and emits no <script>", () => {
    const page = renderSite({
      ...base,
      updates: [
        {
          descriptor: "d9",
          proposedAt: T,
          githubUrl: "u",
          impactMd: "<script>alert(1)</script>",
          provenance: null,
        },
      ],
    }).find((f) => f.path === "updates/d9.html")!.content;
    expect(page).not.toContain("<script");
  });
});

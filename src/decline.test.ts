import { describe, it, expect } from "vitest";
import { renderDeclineRecord, declineFile, type DeclineInput } from "./decline";

const base: DeclineInput = {
  descriptor: "oews-2026",
  reason: "2026 figures look anomalous; waiting for the BLS revision.",
  declinedAt: "2026-06-26T12:00:00Z",
};

describe("renderDeclineRecord", () => {
  it("includes frontmatter, heading, and the reason in the body", () => {
    const md = renderDeclineRecord({ ...base, prNumber: 7, declinedBy: "octocat" });
    expect(md).toContain('descriptor: "oews-2026"');
    expect(md).toContain('declined_at: "2026-06-26T12:00:00Z"');
    expect(md).toContain("data_pr: 7");
    expect(md).toContain('declined_by: "octocat"');
    expect(md).toContain("# Declined: oews-2026");
    expect(md).toContain(base.reason);
  });

  it("omits optional frontmatter fields when absent", () => {
    const md = renderDeclineRecord(base);
    expect(md).not.toContain("data_pr:");
    expect(md).not.toContain("declined_by:");
  });

  it("uses a placeholder when the reason is empty", () => {
    const md = renderDeclineRecord({ ...base, reason: "   " });
    expect(md).toContain("_No reason was given when the data-PR was closed._");
  });

  it("preserves a multi-line reason verbatim", () => {
    const reason = "Line one.\nLine two.";
    expect(renderDeclineRecord({ ...base, reason })).toContain(reason);
  });

  it("rejects an invalid descriptor and a non-ISO date", () => {
    expect(() => renderDeclineRecord({ ...base, descriptor: "Bad Desc" })).toThrow(
      /Invalid descriptor/,
    );
    expect(() => renderDeclineRecord({ ...base, declinedAt: "soon" })).toThrow(/ISO-8601 date/);
  });
});

describe("declineFile", () => {
  it("derives the canonical path + content", () => {
    const f = declineFile(base);
    expect(f.path).toBe(".research/decisions/oews-2026.md");
    expect(f.content).toContain("# Declined: oews-2026");
  });
});

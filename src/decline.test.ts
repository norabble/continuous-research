import { describe, it, expect } from "vitest";
import { renderDeclineRecord, declineFile, parseDeclineRecord, type DeclineInput } from "./decline";

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

describe("parseDeclineRecord", () => {
  it("round-trips a rendered record, snake_case -> camelCase", () => {
    const input = {
      descriptor: "btcusd-2026-06-28",
      reason: "Declining: 2026-06-28 looks anomalous (skeleton decline test)",
      declinedAt: "2026-06-28T17:30:00Z",
      prNumber: 2,
      declinedBy: "rbaker5",
    };
    expect(parseDeclineRecord(renderDeclineRecord(input))).toEqual({
      descriptor: input.descriptor,
      declinedAt: input.declinedAt,
      prNumber: input.prNumber,
      declinedBy: input.declinedBy,
      reason: input.reason,
    });
  });

  it("omits optionals the renderer omitted", () => {
    const parsed = parseDeclineRecord(
      renderDeclineRecord({ descriptor: "d1", reason: "no", declinedAt: "2026-06-28T17:30:00Z" }),
    );
    expect(parsed).not.toHaveProperty("prNumber");
    expect(parsed).not.toHaveProperty("declinedBy");
  });

  it("reads a real committed record verbatim", () => {
    const real = `---
descriptor: "limits-google-1d355812"
declined_at: "2026-07-06T11:29:48Z"
data_pr: 2
declined_by: "rbaker5"
---

# Declined: limits-google-1d355812

## Reason

Closed without merge; no reason provided.
`;
    expect(parseDeclineRecord(real)).toEqual({
      descriptor: "limits-google-1d355812",
      declinedAt: "2026-07-06T11:29:48Z",
      prNumber: 2,
      declinedBy: "rbaker5",
      reason: "Closed without merge; no reason provided.",
    });
  });

  it("rejects a record missing a required frontmatter field", () => {
    expect(() => parseDeclineRecord('---\ndescriptor: "d1"\n---\n\nbody')).toThrow(
      /"declined_at" must be a string/,
    );
  });
});

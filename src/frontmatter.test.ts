import { describe, it, expect } from "vitest";
import { formatDocument, formatFrontmatter, parseDocument } from "./frontmatter";

describe("formatFrontmatter", () => {
  it("fences the block and orders known OKF keys before custom ones", () => {
    const out = formatFrontmatter({
      backs: ["close", "ma7"],
      status: "stable",
      type: "Finding",
      claim_status: "supported",
      title: "A finding",
    });
    expect(out.startsWith("---\n")).toBe(true);
    expect(out.endsWith("---\n")).toBe(true);
    const keys = out
      .split("\n")
      .filter((l) => /^\w/.test(l))
      .map((l) => l.split(":")[0]);
    // Known keys in canonical order first; custom keys after, insertion-ordered.
    expect(keys).toEqual(["type", "title", "status", "backs", "claim_status"]);
  });

  it("returns empty string for empty data", () => {
    expect(formatFrontmatter({})).toBe("");
  });
});

// Quoting, not structure, is where a hand-rolled emitter fails. These are the
// real shapes from the live instances plus the YAML foot-guns.
describe("adversarial values round-trip", () => {
  const adversarial = {
    type: "Finding",
    colonSpace: "Google — Gemini API free tier: a note",
    leadingHash: "# not a comment",
    emDashMoney: "BTC-USD closed at $59,961 — 0.47% above its trailing 7-day average",
    backticks: "the `btcusd-2026-07-01` edition",
    bareDate: "2026-07-01",
    coercible: "1.0",
    nullish: "null",
    hash: "sha256:46305ced46e5ab8a9620fd4b060353aa057d297a6978dc727afbfb4f36f9ee54",
    quote: 'she said "no"',
    percent: "100% of the time",
  };

  it("emit -> parse is deep-equal", () => {
    const doc = formatDocument(adversarial, "body text");
    expect(parseDocument(doc).data).toEqual(adversarial);
  });

  it("never soft-wraps a long prose title", () => {
    const long = "x".repeat(400);
    const out = formatFrontmatter({ title: long });
    // One line for the value: fence, title line, fence.
    expect(out.split("\n").filter((l) => l !== "" && l !== "---")).toHaveLength(1);
    expect(parseDocument(formatDocument({ title: long }, "b")).data.title).toBe(long);
  });

  it("is byte-stable across repeated emission", () => {
    expect(formatDocument(adversarial, "body")).toBe(formatDocument(adversarial, "body"));
  });
});

// OKF's reference implementation is Python, and PyYAML defaults to YAML 1.1
// where a bare `yes` is boolean true. We emit 1.2, so these must be quoted or
// they change type crossing the boundary.
describe("YAML 1.1 boolean-like strings", () => {
  it("force-quotes them at every nesting depth", () => {
    const out = formatFrontmatter({
      a: "yes",
      b: "No",
      c: "off",
      nested: { d: "y" },
      list: ["on", "ok"],
      sources: [{ id: "n", resource: "https://x.test" }],
    });
    expect(out).toContain('a: "yes"');
    expect(out).toContain('b: "No"');
    expect(out).toContain('c: "off"');
    expect(out).toContain('d: "y"');
    expect(out).toContain('- "on"');
    expect(out).toContain("- ok");
    expect(out).toContain('id: "n"');
  });

  it("leaves date-shaped values bare, matching the OKF spec's own examples", () => {
    expect(formatFrontmatter({ stale_after: "2026-12-31" })).toContain("stale_after: 2026-12-31");
  });
});

describe("nested OKF structures", () => {
  it("emits sources / generated / verified and round-trips them", () => {
    const data = {
      type: "Edition",
      sources: [
        {
          id: "gemini-api-rate-limits",
          resource: "https://ai.google.dev/gemini-api/docs/rate-limits?hl=en",
          last_modified: "2026-07-12",
        },
      ],
      generated: { by: "process:trip-wire", at: "2026-07-12T17:05:26.564Z" },
      verified: [{ by: "human:rbaker5", at: "2026-07-13T09:00:00Z" }],
    };
    expect(parseDocument(formatDocument(data, "")).data).toEqual(data);
  });
});

describe("formatDocument", () => {
  it("separates frontmatter and body with one blank line, one trailing newline", () => {
    expect(formatDocument({ type: "Log" }, "# Title\n\ntext")).toBe(
      "---\ntype: Log\n---\n\n# Title\n\ntext\n",
    );
  });

  it("omits the body section entirely when the body is blank", () => {
    expect(formatDocument({ type: "Log" }, "   \n\n")).toBe("---\ntype: Log\n---\n");
  });
});

describe("parseDocument", () => {
  it("treats a document with no frontmatter as empty data plus full body", () => {
    // Not an error: the conformance check must be able to REPORT a missing
    // `type`, which means it has to parse the file first.
    expect(parseDocument("# Just markdown\n")).toEqual({ data: {}, body: "# Just markdown\n" });
  });

  it("parses the real decline-record frontmatter shape", () => {
    const parsed = parseDocument(
      '---\ndescriptor: "btcusd-2026-06-28"\ndeclined_at: "2026-06-28T17:30:00Z"\n' +
        'data_pr: 2\ndeclined_by: "rbaker5"\n---\n\n# Declined: btcusd-2026-06-28\n',
    );
    expect(parsed.data).toEqual({
      descriptor: "btcusd-2026-06-28",
      declined_at: "2026-06-28T17:30:00Z",
      data_pr: 2, // unquoted in the emitter — stays a number
      declined_by: "rbaker5",
    });
    expect(parsed.body).toBe("# Declined: btcusd-2026-06-28\n");
  });

  it("rejects frontmatter that is not a mapping", () => {
    expect(() => parseDocument("---\n- a\n- b\n---\n\nbody")).toThrow(/must be a YAML mapping/);
  });
});

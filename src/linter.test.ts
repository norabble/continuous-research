import { describe, it, expect } from "vitest";
import { lintConsistency } from "./linter";
import { parseAnnotations } from "./annotations";
import type { ChangedKey } from "./results";

const chg = (key: string): ChangedKey => ({ key, from: 1, to: 2 });

describe("lintConsistency", () => {
  it("flags a backs key missing from results.json", () => {
    const index = parseAnnotations("<!-- claim: c | backs: nope | status: supported -->");
    const out = lintConsistency({ results: { close: 100 }, index, changed: [] });
    expect(out).toContainEqual({
      level: "error",
      claimId: "c",
      message: expect.stringContaining("nope") as string,
    });
  });

  it("accepts a subtree backs key resolved by a nested result", () => {
    const index = parseAnnotations("<!-- claim: c | backs: google.free | status: supported -->");
    const out = lintConsistency({
      results: { google: { free: { rpd: 500 } } },
      index,
      changed: [],
    });
    expect(out).toEqual([]);
  });

  it("reports duplicates and malformed annotations", () => {
    const index = parseAnnotations(
      [
        "<!-- claim: a | backs: close | status: supported -->",
        "<!-- claim: a | backs: close | status: supported -->",
        "<!-- claim: bad | status: supported -->",
      ].join("\n"),
    );
    const out = lintConsistency({ results: { close: 1 }, index, changed: [] });
    expect(out.some((f) => f.message.includes("duplicate"))).toBe(true);
    expect(out.some((f) => f.message.includes("malformed"))).toBe(true);
  });

  it("flags an editions entry that is not an accepted edition", () => {
    const index = parseAnnotations(
      "<!-- claim: c | backs: close | status: supported | editions: limits-github-74e042c7, typo-here -->",
    );
    const out = lintConsistency({
      results: { close: 1 },
      index,
      changed: [],
      knownEditions: ["limits-github-74e042c7"],
    });
    expect(out).toEqual([
      {
        level: "error",
        claimId: "c",
        message: 'editions entry "typo-here" is not an accepted edition',
      },
    ]);
  });

  it("skips the editions rule entirely when knownEditions is not supplied", () => {
    const index = parseAnnotations(
      "<!-- claim: c | backs: close | status: supported | editions: anything-at-all -->",
    );
    expect(lintConsistency({ results: { close: 1 }, index, changed: [] })).toEqual([]);
  });

  it("warns when a claim's backing changed but its status was not touched", () => {
    const priorIndex = parseAnnotations("<!-- claim: c | backs: close | status: supported -->");
    const index = parseAnnotations("<!-- claim: c | backs: close | status: supported -->");
    const out = lintConsistency({
      results: { close: 2 },
      index,
      changed: [chg("close")],
      priorIndex,
    });
    expect(out).toContainEqual({
      level: "warn",
      claimId: "c",
      message: expect.stringContaining("status") as string,
    });
  });

  it("no warning when status was touched", () => {
    const priorIndex = parseAnnotations("<!-- claim: c | backs: close | status: supported -->");
    const index = parseAnnotations("<!-- claim: c | backs: close | status: weakened -->");
    const out = lintConsistency({
      results: { close: 2 },
      index,
      changed: [chg("close")],
      priorIndex,
    });
    expect(out.filter((f) => f.level === "warn")).toEqual([]);
  });
});

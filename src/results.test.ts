import { describe, it, expect } from "vitest";
import { flattenResults, diffResults, resolveResultsPath } from "./results";

describe("flattenResults", () => {
  it("dots nested objects, leaves arrays/primitives whole", () => {
    const m = flattenResults({ close: 100, recent: { "2026-06-30": 110 }, tags: [1, 2] });
    expect(m.get("close")).toBe(100);
    expect(m.get("recent.2026-06-30")).toBe(110);
    expect(m.get("tags")).toEqual([1, 2]);
  });
});

describe("diffResults", () => {
  it("reports changed, added, and removed leaves", () => {
    const prev = { close: 100, ma7: 90, gone: 1 };
    const next = { close: 110, ma7: 90, added: 2 };
    expect(diffResults(prev, next)).toEqual([
      { key: "close", from: 100, to: 110 },
      { key: "gone", from: 1, to: undefined },
      { key: "added", from: undefined, to: 2 },
    ]);
  });

  it("no changes → empty", () => {
    expect(diffResults({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 2 } })).toEqual([]);
  });
});

describe("resolveResultsPath", () => {
  it("substitutes ${descriptor}", () => {
    expect(resolveResultsPath("data/btcusd/${descriptor}.json", "btcusd-2026-07-01")).toBe(
      "data/btcusd/btcusd-2026-07-01.json",
    );
  });
});

import { describe, it, expect } from "vitest";
import { parseAnnotations } from "./annotations";

describe("parseAnnotations", () => {
  it("parses flat keys, dotted paths, and (prose)", () => {
    const md = [
      "Prose about BTC.",
      "<!-- claim: btc-short-term-trend | backs: close, ma7, close_vs_ma7_pct, ma7_trend | status: supported -->",
      "More prose.",
      "<!-- claim: google-rpd | backs: google.free.gemini-3.1-flash-lite.rpd | status: supported -->",
      "<!-- claim: session-budget | backs: (prose) | status: supported -->",
    ].join("\n");
    const idx = parseAnnotations(md);
    expect(idx.byId.get("btc-short-term-trend")?.backs).toEqual([
      "close",
      "ma7",
      "close_vs_ma7_pct",
      "ma7_trend",
    ]);
    expect(idx.byId.get("btc-short-term-trend")?.status).toBe("supported");
    expect(idx.byId.get("btc-short-term-trend")?.line).toBe(2);
    expect(idx.byId.get("google-rpd")?.backs).toEqual(["google.free.gemini-3.1-flash-lite.rpd"]);
    expect(idx.byId.get("session-budget")?.backs).toEqual(["(prose)"]);
  });

  it("collects malformed annotation-ish lines, records duplicates, does not throw", () => {
    const md = [
      "<!-- claim: a | backs: x | status: supported -->",
      "<!-- claim: a | backs: y | status: weakened -->",
      "<!-- claim: broken | status: supported -->",
    ].join("\n");
    const idx = parseAnnotations(md);
    expect(idx.byId.get("a")?.backs).toEqual(["x"]); // first wins
    expect(idx.duplicates).toEqual(["a"]);
    expect(idx.malformed).toHaveLength(1);
    expect(idx.malformed[0]?.line).toBe(3);
  });
});

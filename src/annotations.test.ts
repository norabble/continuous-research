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

  it("defaults editions to [] when the optional field is absent", () => {
    const idx = parseAnnotations("<!-- claim: a | backs: x | status: supported -->");
    expect(idx.byId.get("a")?.editions).toEqual([]);
  });

  it("parses editions, trimming and deduping while preserving order", () => {
    const md = [
      "<!-- claim: trend | backs: close | status: supported | editions: btcusd-2026-06-27, btcusd-2026-07-01 -->",
      "<!-- claim: dupe | backs: close | status: supported | editions: a-1, a-1 , a-2 -->",
      "<!-- claim: empty | backs: close | status: supported | editions: -->",
    ].join("\n");
    const idx = parseAnnotations(md);
    expect(idx.byId.get("trend")?.editions).toEqual(["btcusd-2026-06-27", "btcusd-2026-07-01"]);
    // Append-only + an agent that re-appends on every revision ⇒ must be idempotent.
    expect(idx.byId.get("dupe")?.editions).toEqual(["a-1", "a-2"]);
    expect(idx.byId.get("empty")?.editions).toEqual([]);
    expect(idx.malformed).toEqual([]);
  });

  it("never lets a later field leak into status (regression)", () => {
    // The earlier regex anchored the status group on `-->` rather than `|`, so
    // this line parsed with status = "overturned | editions: …" — which fell
    // through okfStatusFor's default and exported an overturned claim as OKF
    // `status: stable`. A silently wrong trust signal, not a parse nit.
    const idx = parseAnnotations(
      "<!-- claim: copilot-free-incompatible | backs: github.free.model-selection | status: overturned | editions: limits-github-74e042c7 -->",
    );
    const a = idx.byId.get("copilot-free-incompatible");
    expect(a?.status).toBe("overturned");
    expect(a?.status).not.toContain("|");
    expect(a?.backs).toEqual(["github.free.model-selection"]);
    expect(a?.editions).toEqual(["limits-github-74e042c7"]);
  });

  it("treats an unrecognised trailing field as malformed rather than absorbing it", () => {
    const idx = parseAnnotations(
      "<!-- claim: a | backs: x | status: supported | edition: typo-here -->",
    );
    expect(idx.byId.size).toBe(0);
    expect(idx.malformed).toHaveLength(1);
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

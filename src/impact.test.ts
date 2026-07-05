import { describe, it, expect } from "vitest";
import { affectedClaims } from "./impact";
import { parseAnnotations } from "./annotations";
import type { ChangedKey } from "./results";

const index = parseAnnotations(
  [
    "<!-- claim: trend | backs: close, ma7 | status: supported -->",
    "<!-- claim: derived | backs: close_vs_ma7_pct | status: supported -->",
    "<!-- claim: subtree | backs: google.free | status: supported -->",
    "<!-- claim: proseonly | backs: (prose) | status: supported -->",
  ].join("\n"),
);
const chg = (key: string): ChangedKey => ({ key, from: 1, to: 2 });

describe("affectedClaims", () => {
  it("matches exact keys", () => {
    expect(affectedClaims([chg("close")], index).map((a) => a.claimId)).toEqual(["trend"]);
  });

  it("does NOT match on substring — close must not hit close_vs_ma7_pct", () => {
    const ids = affectedClaims([chg("close")], index).map((a) => a.claimId);
    expect(ids).not.toContain("derived");
  });

  it("matches a subtree backs key when a leaf under it changes", () => {
    const ids = affectedClaims([chg("google.free.gemini-3.1-flash-lite.rpd")], index).map(
      (a) => a.claimId,
    );
    expect(ids).toEqual(["subtree"]);
  });

  it("never matches (prose) claims", () => {
    expect(affectedClaims([chg("anything")], index).map((a) => a.claimId)).not.toContain(
      "proseonly",
    );
  });
});

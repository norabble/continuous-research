import { describe, it, expect } from "vitest";
import { parseDetectionResult } from "./sensor";

const changed = {
  changed: true,
  descriptor: "btcusd-2026-06-27",
  source: "https://api.example/btc",
  retrievedAt: "2026-06-27T00:00:00Z",
  hash: "sha256:ab",
  artifacts: ["data/btcusd/2026-06-27.json"],
};

const withoutArtifacts = {
  changed: true,
  descriptor: changed.descriptor,
  source: changed.source,
  retrievedAt: changed.retrievedAt,
  hash: changed.hash,
};

describe("parseDetectionResult", () => {
  it("parses changed:false, and treats missing/garbage changed as no change", () => {
    expect(parseDetectionResult('{"changed":false}')).toEqual({ changed: false });
    expect(parseDetectionResult("{}")).toEqual({ changed: false });
  });

  it("parses a full changed:true result", () => {
    expect(parseDetectionResult(JSON.stringify(changed))).toEqual(changed);
  });

  it("defaults artifacts to []", () => {
    expect(parseDetectionResult(JSON.stringify(withoutArtifacts))).toEqual({
      ...withoutArtifacts,
      artifacts: [],
    });
  });

  it("rejects a missing required field when changed", () => {
    const missingHash = {
      changed: true,
      descriptor: changed.descriptor,
      source: changed.source,
      retrievedAt: changed.retrievedAt,
    };
    expect(() => parseDetectionResult(JSON.stringify(missingHash))).toThrow(/"hash"/);
  });

  it("rejects non-string artifacts and a non-object payload", () => {
    expect(() => parseDetectionResult(JSON.stringify({ ...changed, artifacts: [1] }))).toThrow(
      /artifacts/,
    );
    expect(() => parseDetectionResult("42")).toThrow(/must be a JSON object/);
  });
});

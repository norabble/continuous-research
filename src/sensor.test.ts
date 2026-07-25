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

  // The v2 provenance fields are optional: an existing sensor that knows
  // nothing about them must keep parsing exactly as before.
  it("omits sources / generated when the sensor does not supply them", () => {
    const out = parseDetectionResult(JSON.stringify(changed));
    expect(out).not.toHaveProperty("sources");
    expect(out).not.toHaveProperty("generated");
  });

  it("parses optional sources and generated when present", () => {
    const out = parseDetectionResult(
      JSON.stringify({
        ...changed,
        sources: [
          { id: "candles", resource: "https://api.example/btc", lastModified: "2026-06-27" },
        ],
        generated: { by: "process:trip-wire", at: "2026-06-27T00:00:00Z" },
      }),
    );
    expect(out).toMatchObject({
      sources: [{ id: "candles", resource: "https://api.example/btc", lastModified: "2026-06-27" }],
      generated: { by: "process:trip-wire", at: "2026-06-27T00:00:00Z" },
    });
  });

  it("rejects a malformed sources / generated block, naming the field", () => {
    expect(() => parseDetectionResult(JSON.stringify({ ...changed, sources: [] }))).toThrow(
      /"sources" must be a non-empty array/,
    );
    expect(() => parseDetectionResult(JSON.stringify({ ...changed, sources: [{}] }))).toThrow(
      /"sources\[0\]\.resource" must be a non-empty string/,
    );
    expect(() =>
      parseDetectionResult(JSON.stringify({ ...changed, generated: { by: "x" } })),
    ).toThrow(/"generated\.at" must be a non-empty string/);
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

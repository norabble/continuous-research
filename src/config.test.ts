import { describe, it, expect } from "vitest";
import { parseConfig } from "./config";

describe("parseConfig", () => {
  it("parses a declared sensor command", () => {
    expect(parseConfig('{"sensor":"node sensor.js"}')).toEqual({ sensor: "node sensor.js" });
  });

  it("rejects non-object and missing / empty sensor", () => {
    expect(() => parseConfig("42")).toThrow(/must be a JSON object/);
    expect(() => parseConfig("{}")).toThrow(/"sensor"/);
    expect(() => parseConfig('{"sensor":"   "}')).toThrow(/"sensor"/);
  });
});

describe("parseConfig — impact block", () => {
  it("defaults impact to absent (layer off) for a Phase-1 config", () => {
    expect(parseConfig('{"sensor":"x"}').impact).toBeUndefined();
  });

  it("parses an impact block", () => {
    const c = parseConfig(
      '{"sensor":"x","impact":{"enabled":true,"resultsPath":"data/${descriptor}.json","linter":true,"agentEngine":"claude-code"}}',
    );
    expect(c.impact).toEqual({
      enabled: true,
      resultsPath: "data/${descriptor}.json",
      linter: true,
      agentEngine: "claude-code",
    });
  });

  it("rejects a non-boolean impact.enabled", () => {
    expect(() => parseConfig('{"sensor":"x","impact":{"enabled":"yes"}}')).toThrow(
      /impact.enabled/,
    );
  });

  it("rejects an unknown agentEngine", () => {
    expect(() =>
      parseConfig('{"sensor":"x","impact":{"enabled":true,"agentEngine":"copilot"}}'),
    ).toThrow(/agentEngine/);
  });
});

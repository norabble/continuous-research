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

describe("parseConfig — site block", () => {
  it("parses the optional site block", () => {
    const c = parseConfig('{"sensor":"x","site":{"enabled":true,"title":"T","description":"D"}}');
    expect(c.site).toEqual({ enabled: true, title: "T", description: "D" });
  });

  it("rejects a site block without boolean enabled", () => {
    expect(() => parseConfig('{"sensor":"x","site":{"title":"T"}}')).toThrow(
      'config "site.enabled" must be a boolean',
    );
  });

  it("omits site when absent", () => {
    expect(parseConfig('{"sensor":"x"}').site).toBeUndefined();
  });

  it("parses the optional okf freshness window", () => {
    expect(parseConfig('{"sensor":"x","okf":{"enabled":true,"staleAfterDays":30}}').okf).toEqual({
      enabled: true,
      staleAfterDays: 30,
    });
  });

  // "No declared window" and "fresh forever" are different statements, so an
  // unusable value must fail rather than degrade into an absent key.
  it("rejects a non-positive or fractional freshness window", () => {
    for (const v of ["0", "-1", "1.5", '"30"']) {
      expect(() =>
        parseConfig(`{"sensor":"x","okf":{"enabled":true,"staleAfterDays":${v}}}`),
      ).toThrow('config "okf.staleAfterDays" must be a positive integer');
    }
  });

  it("omits the freshness window when absent", () => {
    expect(
      parseConfig('{"sensor":"x","okf":{"enabled":true}}').okf?.staleAfterDays,
    ).toBeUndefined();
  });
});

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

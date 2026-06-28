import { describe, it, expect } from "vitest";
import { parseRepository } from "./io";

describe("parseRepository", () => {
  it("splits owner/repo", () => {
    expect(parseRepository("norabble/continuous-research")).toEqual({
      owner: "norabble",
      repo: "continuous-research",
    });
  });

  it("rejects malformed slugs", () => {
    expect(() => parseRepository("noslash")).toThrow(/owner\/repo/);
    expect(() => parseRepository("a/b/c")).toThrow(/owner\/repo/);
    expect(() => parseRepository("/x")).toThrow(/owner\/repo/);
    expect(() => parseRepository("x/")).toThrow(/owner\/repo/);
  });
});

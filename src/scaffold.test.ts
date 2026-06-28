import { describe, it, expect } from "vitest";
import { scaffoldFiles } from "./scaffold";
import { parseConfig } from "./config";

describe("scaffoldFiles", () => {
  const files = scaffoldFiles();
  const byPath = (p: string) => files.find((f) => f.path === p)?.content ?? "";

  it("emits the config + both workflows", () => {
    expect(files.map((f) => f.path)).toEqual([
      ".research/config.json",
      ".github/workflows/sense.yml",
      ".github/workflows/decline.yml",
    ]);
  });

  it("emits a parseable config with a sensor", () => {
    expect(parseConfig(byPath(".research/config.json")).sensor).toBeTruthy();
  });

  it("sense.yml has the concurrency guard and a literal Actions expression", () => {
    const sense = byPath(".github/workflows/sense.yml");
    expect(sense).toContain("name: sense");
    expect(sense).toContain("concurrency:");
    // The GitHub expression must survive as a literal, not a TS interpolation.
    expect(sense).toContain("${{ secrets.GITHUB_TOKEN }}");
    expect(sense).toContain("npx --yes github:norabble/continuous-research sense");
  });

  it("decline.yml gates on closed-unmerged data-PRs", () => {
    const decline = byPath(".github/workflows/decline.yml");
    expect(decline).toContain("types: [closed]");
    expect(decline).toContain("github.event.pull_request.merged == false");
    expect(decline).toContain("record-decline");
  });
});

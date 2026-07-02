import { describe, it, expect } from "vitest";
import { scaffoldFiles } from "./scaffold";
import { parseConfig } from "./config";

describe("scaffoldFiles", () => {
  const files = scaffoldFiles();
  const byPath = (p: string) => files.find((f) => f.path === p)?.content ?? "";

  it("emits the config, both engine workflows, and the interpretation template", () => {
    expect(files.map((f) => f.path)).toEqual([
      ".research/config.json",
      ".github/workflows/sense.yml",
      ".github/workflows/decline.yml",
      ".github/workflows/interpretation.md",
    ]);
  });

  it("emits a parseable config with a sensor", () => {
    expect(parseConfig(byPath(".research/config.json")).sensor).toBeTruthy();
  });

  it("sense.yml mints an App token and hands it to the engine", () => {
    const sense = byPath(".github/workflows/sense.yml");
    expect(sense).toContain("actions/create-github-app-token@v2");
    // Literal Actions expressions must survive (not TS interpolation).
    expect(sense).toContain("app-id: ${{ secrets.APP_ID }}");
    expect(sense).toContain("GITHUB_TOKEN: ${{ steps.app-token.outputs.token }}");
    expect(sense).toContain("concurrency:");
    expect(sense).toContain("timeout-minutes:");
    expect(sense).toContain("npx --yes github:norabble/continuous-research sense");
    // The workflow's own token stays read-only; the App does the writes.
    expect(sense).toContain("contents: read");
  });

  it("decline.yml gates on closed-unmerged data-PRs", () => {
    const decline = byPath(".github/workflows/decline.yml");
    expect(decline).toContain("types: [closed]");
    expect(decline).toContain("github.event.pull_request.merged == false");
    expect(decline).toContain("timeout-minutes:");
    expect(decline).toContain("record-decline");
  });

  it("interpretation.md carries the proven gh-aw safe-output contract", () => {
    const interp = byPath(".github/workflows/interpretation.md");
    expect(interp).toContain("push-to-pull-request-branch:");
    expect(interp).toContain("protected-files: allowed");
    expect(interp).toContain('".research/impact/*.md"');
    expect(interp).toContain('"findings.md"');
    expect(interp).toContain("types: [opened, reopened]");
    // Instance-specific TODOs the author must fill in.
    expect(interp).toContain("your-app-slug");
    // The annotation example must be a fenced block, NOT an HTML comment —
    // the gh-aw prompt renderer strips HTML comments even inside code spans.
    expect(interp).toContain("claim: <id> | backs: <result keys> | status: <status>");
    expect(interp).not.toContain("<!--");
  });
});

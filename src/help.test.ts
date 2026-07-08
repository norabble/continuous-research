import { describe, expect, it } from "vitest";
import { CLI_COMMANDS, helpText } from "./help";

describe("helpText", () => {
  const text = helpText("0.1.2");

  it("names the binary and version", () => {
    expect(text).toContain("continuous-research");
    expect(text).toContain("0.1.2");
  });

  it("lists every command with a one-line summary", () => {
    for (const { name, summary } of CLI_COMMANDS) {
      expect(text).toContain(name);
      expect(text).toContain(summary);
    }
    expect(CLI_COMMANDS.map((c) => c.name)).toEqual([
      "init",
      "sense",
      "record-decline",
      "impact",
      "site",
      "escalate-drift",
    ]);
  });

  it("documents the environment the engine commands need", () => {
    expect(text).toContain("GITHUB_TOKEN");
    expect(text).toContain("GITHUB_REPOSITORY");
    expect(text).toContain("GITHUB_EVENT_PATH");
  });

  it("points at the full reference", () => {
    expect(text).toContain("docs/cli.md");
  });
});

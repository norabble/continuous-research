/**
 * CLI help text — pure string builders so the surface an adopter first meets
 * is unit-tested like everything else. The version is injected by the shell
 * in `cli.ts` (it owns package.json access).
 */

export const CLI_COMMANDS: ReadonlyArray<{ name: string; summary: string }> = [
  { name: "init", summary: "scaffold .research/ + workflows into the current repo" },
  { name: "sense", summary: "run the declared sensor, dedup, propose the data-PR" },
  { name: "record-decline", summary: "commit the decline record for a closed-unmerged data-PR" },
];

export function helpText(version: string): string {
  const width = Math.max(...CLI_COMMANDS.map((c) => c.name.length));
  const commands = CLI_COMMANDS.map((c) => `  ${c.name.padEnd(width)}  ${c.summary}`).join("\n");
  return [
    `continuous-research v${version} — Continuous Research config CLI + runtime engine`,
    "",
    "Usage: continuous-research <command>",
    "",
    "Commands:",
    commands,
    "",
    "Environment (engine commands, provided by GitHub Actions):",
    "  GITHUB_TOKEN       auth for the GitHub API (GH_TOKEN also accepted)",
    "  GITHUB_REPOSITORY  target repo as owner/repo",
    "  GITHUB_EVENT_PATH  event payload; required by record-decline",
    "",
    "Options: --help (-h), --version (-v)",
    "",
    "Full reference: docs/cli.md — adoption guide: docs/adopting.md",
    "https://github.com/norabble/continuous-research",
  ].join("\n");
}

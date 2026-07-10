import { describe, it, expect } from "vitest";
import { scaffoldFiles } from "./scaffold";
import { parseConfig } from "./config";

describe("scaffoldFiles", () => {
  const files = scaffoldFiles();
  const byPath = (p: string) => files.find((f) => f.path === p)?.content ?? "";
  const fileContent = byPath;

  it("emits the config, both engine workflows, the site workflow, the optional sensor-repair workflow, and both agent templates", () => {
    expect(files.map((f) => f.path)).toEqual([
      ".research/config.json",
      ".github/workflows/sense.yml",
      ".github/workflows/decline.yml",
      ".github/workflows/site.yml",
      ".github/workflows/sensor-repair.yml",
      ".github/workflows/interpretation.md",
      ".github/workflows/comment-resolution.md",
    ]);
  });

  it("scaffolds the site workflow", () => {
    const site = byPath(".github/workflows/site.yml");
    expect(site).toContain("actions/deploy-pages");
    expect(site).toContain("npx --yes github:norabble/continuous-research#v0.1.5 site");
    expect(site).toContain("pages: write");
    // A fresh scaffold ships site.enabled=false, so the engine writes no
    // _site/ — the package/upload/deploy steps must all be gated on the
    // build having produced output, or every PR/push fails CI out of the box.
    expect(site.match(/if: hashFiles\('_site\/\*\*'\) != ''/g)).toHaveLength(3);
    // PR events matter only for data-PRs; push/dispatch always rebuild.
    expect(site).toContain(
      "github.event_name != 'pull_request' ||\n" +
        "      contains(join(github.event.pull_request.labels.*.name, ','), 'data:')",
    );
    // Literal Actions expressions must survive (not TS interpolation).
    expect(site).toContain("url: ${{ steps.deploy.outputs.page_url }}");
    expect(site).toContain("GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}");
  });

  it("config template carries a disabled site block", () => {
    const config = JSON.parse(byPath(".research/config.json")) as unknown;
    expect((config as { site: unknown }).site).toEqual({
      enabled: false,
      title: "TODO: your project title",
    });
  });

  it("comment-resolution.md uses the slash-command trigger and sanitized text", () => {
    const res = byPath(".github/workflows/comment-resolution.md");
    expect(res).toContain("slash_command:");
    expect(res).toContain("name: resolve");
    // Sanitized comment interpolation must survive as a literal expression,
    // with no stray escaping around backticks.
    expect(res).toContain("${{ steps.sanitized.outputs.text }}");
    expect(res).not.toContain("\\`");
    expect(res).toContain("protected-files: allowed");
    expect(res).toContain("add-comment:");
  });

  it("emits a parseable config with a sensor", () => {
    expect(parseConfig(byPath(".research/config.json")).sensor).toBeTruthy();
  });

  it("sense.yml mints an App token and hands it to the engine", () => {
    const sense = byPath(".github/workflows/sense.yml");
    expect(sense).toContain(
      "actions/create-github-app-token@fee1f7d63c2ff003460e3d139729b119787bc349 # v2",
    );
    // Literal Actions expressions must survive (not TS interpolation).
    expect(sense).toContain("app-id: ${{ secrets.CONTINUOUS_RESEARCH_APP_ID }}");
    expect(sense).toContain("GITHUB_TOKEN: ${{ steps.app-token.outputs.token }}");
    expect(sense).toContain("concurrency:");
    expect(sense).toContain("timeout-minutes:");
    // The engine ref is pinned — instances upgrade deliberately, not on HEAD.
    expect(sense).toContain("npx --yes github:norabble/continuous-research#v0.1.5 sense");
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

  it("sense template escalates drift after the engine run", () => {
    const sense = byPath(".github/workflows/sense.yml");
    expect(sense).toContain("escalate-drift");
    // Escalation runs on the App token (issues write), same as the engine.
    expect(sense.indexOf("escalate-drift")).toBeGreaterThan(sense.indexOf("app-token"));
  });

  it("scaffolds the optional sensor-repair workflow", () => {
    const repair = byPath(".github/workflows/sensor-repair.yml");
    expect(repair).toContain("anthropics/claude-code-action");
    expect(repair).toContain("allowed_bots");
    expect(repair).toContain("needs: repair"); // two-job token isolation
    // Actions expressions survived TS-template escaping into the output:
    expect(repair).toContain("${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}");
    expect(repair).toContain("${GH_TOKEN}"); // shell brace expansion intact too
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

  it("pins every action reference to a full commit SHA", () => {
    for (const f of scaffoldFiles()) {
      for (const line of f.content.split("\n")) {
        if (line.includes("uses:")) {
          expect(line, `${f.path}: ${line}`).toMatch(/@[0-9a-f]{40} # v\d/);
        }
      }
    }
  });

  it("engine-running workflows use node 24 (npm 11 installs commit-pinned git deps)", () => {
    for (const p of ["sense.yml", "decline.yml", "site.yml"]) {
      expect(fileContent(`.github/workflows/${p}`)).toContain('node-version: "24"');
    }
  });

  it("decline writes main via the App token, not GITHUB_TOKEN", () => {
    const decline = fileContent(".github/workflows/decline.yml");
    expect(decline).toContain("create-github-app-token");
    expect(decline).toContain("permission-contents: write");
    expect(decline).not.toMatch(/GITHUB_TOKEN: \$\{\{ secrets.GITHUB_TOKEN \}\}/);
  });

  it("site inlines the Pages upload (no composite with nested unpinned refs)", () => {
    const site = fileContent(".github/workflows/site.yml");
    expect(site).not.toContain("upload-pages-artifact");
    expect(site).toContain("name: github-pages");
  });
});

# Sample-Instance Learnings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Backport what going-public on `continuous-research-sample`
(2026-07-07) taught us: fix relative links on the live site, promote drift
escalation + sensor-repair from instance-side hacks into framework features,
and harden the `init` scaffold templates to the configuration the sample now
runs.

**Architecture:** Three independent stages, each shippable alone.
Stage A teaches the site renderer to rewrite repo-relative link/image
destinations to GitHub `blob/HEAD` / `raw/HEAD` URLs (the site is a *view*;
GitHub stays the canonical file host). Stage B adds an `escalate-drift`
engine command (pure planner + GitHub-port writes, per design rule 1) and
scaffolds the sample's proven two-job `sensor-repair.yml`. Stage C rewrites
the scaffold templates to the hardened shape the sample converged on
(SHA-pinned actions, node 24 for engine steps, App-token main-writes,
inlined Pages upload) and documents the go-public checklist.

**Tech Stack:** TypeScript (ESM, strict), Node ≥ 22, vitest, marked,
octokit. No new dependencies.

## Global Constraints

- ESM only; `import type` for type-only imports (`verbatimModuleSyntax`).
- Ports-and-adapters: pure cores never do I/O; GitHub goes behind
  `src/ports.ts` `GitHubPort`; tests inject fakes, never call GitHub.
- Vocabulary from CONCEPT.md → Canonical terms (descriptor, edition,
  data-PR, decline record…). New term introduced here: **drift report**
  (`.research/drift/report.json`) and **drift escalation**.
- Prettier owns formatting (`npm run format`); don't hand-format. Markdown
  docs are hand-wrapped ~80 col — preserve, don't reflow.
- In `src/scaffold.ts` template literals, GitHub Actions expressions must be
  written `\${{ ... }}` (escaped) so they emit literally.
- `npm run check` before every commit (typecheck + lint + format + tests).
  npm needs the sandbox override in this environment.
- Commits: imperative subject, body says why, trailer
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Work on a branch cut from the current `live-site-v1` tip (contains the
  v0.1.5 release): `git checkout -b sample-learnings-v1 live-site-v1`.
- The framework is engine-agnostic: gh-aw may be assumed implicitly;
  anything Claude-specific (sensor-repair's claude-code-action) must be
  labeled an optional, documented integration.

## Empirical facts this plan encodes (verified 2026-07-07 on the sample)

- Relative hrefs in `findings.md` (e.g. `[README](./README.md)`) pass
  `isSafeHref` (schemeless) and 404 on GitHub Pages.
- npm 10 (node 22) cannot install a git dep pinned to a bare commit SHA
  ("GitFetcher requires an Arborist constructor"); npm 11 (node 24) can.
  Archive tarballs are NOT a workaround (they skip `prepare`, so no
  `dist/cli.js`).
- `sha_pinning_required` rejects unpinned refs *nested inside composite
  actions* — `upload-pages-artifact` fails because it calls
  `actions/upload-artifact@v4` internally. Inlining its two steps fixes it.
- `GITHUB_TOKEN` can never bypass a repository ruleset; workflows that push
  to a protected `main` must authenticate as a bypass-listed GitHub App.
- A repair agent that reads issues on a public repo is prompt-injectable via
  issue comments; locking the drift issue at creation closes that channel.
- Action SHAs current for the tags we template (resolved 2026-07-07):
  - `actions/checkout@v4` → `34e114876b0b11c390a56381ad16ebd13914f8d5`
  - `actions/setup-node@v4` → `49933ea5288caeca8642d1e84afbd3f7d6820020`
  - `actions/create-github-app-token@v2` → `fee1f7d63c2ff003460e3d139729b119787bc349`
  - `anthropics/claude-code-action@v1` → `0fe28cdb64e23015219b0e478100b7105fd7dfa1`
  - `actions/upload-artifact@v7` → `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a`
  - `actions/download-artifact@v8` → `3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c`
  - `actions/deploy-pages@v4` → `d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e`

---

## Stage A — site: rewrite repo-relative links

### Task 1: `site-md` link rewriting

**Files:**
- Modify: `src/site-md.ts`
- Test: `src/site-md.test.ts`

**Interfaces:**
- Produces: `renderUntrustedMarkdown(md: string, opts?: RenderOptions): string`
  with `interface RenderOptions { repoSlug?: string; sourceDir?: string }`
  (exported). Existing single-argument callers keep working (opts optional).
- The safety contract is untouched: rewriting happens only for hrefs that
  already passed `isSafeHref` AND have no scheme AND are not
  protocol-relative.

- [ ] **Step 1: Write the failing tests**

Append to `src/site-md.test.ts` (match the file's existing describe/it
style when you open it):

```ts
describe("relative link rewriting", () => {
  const opts = { repoSlug: "norabble/continuous-research-sample" };

  it("rewrites a root-relative link to blob/HEAD", () => {
    const html = renderUntrustedMarkdown("[readme](./README.md)", opts);
    expect(html).toContain(
      'href="https://github.com/norabble/continuous-research-sample/blob/HEAD/README.md"',
    );
  });

  it("rewrites an image to raw/HEAD", () => {
    const html = renderUntrustedMarkdown("![chart](plots/chart.png)", opts);
    expect(html).toContain(
      'src="https://github.com/norabble/continuous-research-sample/raw/HEAD/plots/chart.png"',
    );
  });

  it("resolves the source directory and parent traversal", () => {
    const html = renderUntrustedMarkdown("[data](../../data/x.json)", {
      ...opts,
      sourceDir: ".research/impact",
    });
    expect(html).toContain(
      'href="https://github.com/norabble/continuous-research-sample/blob/HEAD/data/x.json"',
    );
  });

  it("leaves traversal above the repo root unrewritten", () => {
    const html = renderUntrustedMarkdown("[up](../escape.md)", opts);
    expect(html).toContain('href="../escape.md"');
  });

  it("treats a leading slash as repo-root", () => {
    const html = renderUntrustedMarkdown("[s](/sensor.mjs)", {
      ...opts,
      sourceDir: ".research/impact",
    });
    expect(html).toContain(
      'href="https://github.com/norabble/continuous-research-sample/blob/HEAD/sensor.mjs"',
    );
  });

  it("preserves fragments and skips pure-fragment anchors", () => {
    expect(renderUntrustedMarkdown("[a](docs/x.md#part)", opts)).toContain(
      'href="https://github.com/norabble/continuous-research-sample/blob/HEAD/docs/x.md#part"',
    );
    expect(renderUntrustedMarkdown("[a](#local)", opts)).toContain('href="#local"');
  });

  it("leaves absolute http(s) and mailto untouched", () => {
    expect(renderUntrustedMarkdown("[x](https://example.com/a)", opts)).toContain(
      'href="https://example.com/a"',
    );
    expect(renderUntrustedMarkdown("[m](mailto:a@b.c)", opts)).toContain(
      'href="mailto:a@b.c"',
    );
  });

  it("still neutralizes unsafe schemes to #, never rewrites them", () => {
    const html = renderUntrustedMarkdown("[x](javascript:alert(1))", opts);
    expect(html).toContain('href="#"');
  });

  it("does not rewrite when repoSlug is absent (back-compat)", () => {
    const html = renderUntrustedMarkdown("[readme](./README.md)");
    expect(html).toContain('href="./README.md"');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/site-md.test.ts`
Expected: the new describe block FAILS (hrefs unrewritten); existing tests
PASS.

- [ ] **Step 3: Implement**

In `src/site-md.ts`, add below `isSafeHref` (and extend the module doc
comment with one sentence: relative destinations are optionally rewritten to
GitHub blob/raw URLs because site pages are served off-repo):

```ts
export interface RenderOptions {
  /**
   * "owner/repo". When set, relative link/image destinations are rewritten
   * to GitHub blob/raw URLs — site pages are served off-repo (Pages), so a
   * repo-relative href would 404 there. GitHub remains the canonical host
   * for repo files.
   */
  repoSlug?: string;
  /** Repo-relative directory the markdown source lives in ("" = root). */
  sourceDir?: string;
}

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** Pure ./ and ../ resolution against the repo root; null = escapes root. */
const resolveRepoPath = (sourceDir: string, ref: string): string | null => {
  const joined = ref.startsWith("/") ? ref.slice(1) : `${sourceDir}/${ref}`;
  const out: string[] = [];
  for (const seg of joined.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (out.length === 0) return null;
      out.pop();
    } else {
      out.push(seg);
    }
  }
  return out.length === 0 ? null : out.join("/");
};

const rewriteRelativeHref = (
  href: string,
  view: "blob" | "raw",
  opts: RenderOptions,
): string => {
  const trimmed = href.trim();
  // Only schemeless, non-protocol-relative refs are candidates; isSafeHref
  // has already run, so anything else is absolute (kept) or neutralized.
  if (HAS_SCHEME.test(trimmed) || trimmed.startsWith("//")) return href;
  const hash = trimmed.indexOf("#");
  const path = hash === -1 ? trimmed : trimmed.slice(0, hash);
  const fragment = hash === -1 ? "" : trimmed.slice(hash);
  if (path === "") return href; // same-page anchor
  const resolved = resolveRepoPath(opts.sourceDir ?? "", path);
  if (resolved === null) return href;
  return `https://github.com/${opts.repoSlug}/${view}/HEAD/${resolved}${fragment}`;
};
```

Change the signature and `walkTokens` body:

```ts
export function renderUntrustedMarkdown(md: string, opts: RenderOptions = {}): string {
  const withoutAnnotations = md.replace(ANNOTATION_LINE, "");
  const source = escapeHtml(withoutAnnotations);
  const marked = new Marked({
    async: false,
    walkTokens: (token) => {
      if (!isLinkOrImageToken(token)) return;
      if (!isSafeHref(token.href)) {
        token.href = "#";
        return;
      }
      if (opts.repoSlug) {
        token.href = rewriteRelativeHref(
          token.href,
          token.type === "image" ? "raw" : "blob",
          opts,
        );
      }
    },
  });
  return marked.parse(source) as string;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/site-md.test.ts`
Expected: PASS (all, including pre-existing).

- [ ] **Step 5: Commit**

```bash
git add src/site-md.ts src/site-md.test.ts
git commit -m "site-md: rewrite repo-relative links to GitHub blob/raw URLs"
```
(Body: relative links copied from repo markdown 404 on Pages — first seen
live on the sample, 2026-07-07. Trailer per Global Constraints.)

### Task 2: plumb `repoSlug` through site-render and the site command

**Files:**
- Modify: `src/site-render.ts` (add `repoSlug` to `SiteData`; pass opts at
  every `renderUntrustedMarkdown` call site)
- Modify: `src/commands.ts` (`SiteDeps` → site data)
- Modify: `src/cli.ts` (pass `process.env.GITHUB_REPOSITORY ?? null`)
- Test: `src/site-render.test.ts`

**Interfaces:**
- Consumes: `RenderOptions` from Task 1.
- Produces: `SiteData.repoSlug: string | null` (new required field —
  update every `SiteData` literal in tests; use `null` where irrelevant).
- Call-site rule: markdown whose source file is `findings.md` renders with
  `sourceDir: ""`; markdown from impact declarations renders with
  `sourceDir: ".research/impact"`.

- [ ] **Step 1: Write the failing test**

In `src/site-render.test.ts`, using the file's existing fixture helpers:

```ts
it("rewrites relative findings links against the repo", () => {
  const files = renderSite({
    ...baseSiteData, // whatever minimal fixture the file already uses
    repoSlug: "norabble/continuous-research-sample",
    findingsMd: "[the sensor](./sensor.mjs)",
  });
  const index = files.find((f) => f.path === "index.html")!;
  expect(index.content).toContain(
    'href="https://github.com/norabble/continuous-research-sample/blob/HEAD/sensor.mjs"',
  );
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/site-render.test.ts`
Expected: compile error (`repoSlug` unknown) or missing rewrite.

- [ ] **Step 3: Implement**

1. `SiteData` gains `repoSlug: string | null`.
2. In `site-render.ts`, derive once near the top of `renderSite`:
   `const md = (src: string, sourceDir: string) =>
   renderUntrustedMarkdown(src, data.repoSlug ? { repoSlug: data.repoSlug, sourceDir } : {});`
   and replace each direct `renderUntrustedMarkdown(x)` call with
   `md(x, "")` for findings sources and `md(x, ".research/impact")` for
   impact bodies/excerpts (grep the call sites; there are a handful,
   including the head/rest findings split around line 131).
3. `commands.ts`: `SiteDeps` gains `repoSlug: string | null`; thread it
   into the `SiteData` it builds.
4. `cli.ts` site command: pass
   `repoSlug: process.env.GITHUB_REPOSITORY ?? null` (same env var the
   fallback title already uses, cli.ts:100).
5. Fix all `SiteData`/`SiteDeps` literals in tests (`repoSlug: null`
   except the new test).

- [ ] **Step 4: Run the full suite** — `npm run check`
Expected: PASS (typecheck will catch any missed literal).

- [ ] **Step 5: Commit**

```bash
git add src/site-render.ts src/site-render.test.ts src/commands.ts src/cli.ts
git commit -m "site: thread the repo slug so relative links resolve on Pages"
```

---

## Stage B — drift escalation in the engine + scaffolded sensor-repair

### Task 3: pure drift-escalation planner

**Files:**
- Create: `src/drift.ts`
- Test: `src/drift.test.ts`

**Interfaces:**
- Produces (consumed by Tasks 4–5):

```ts
export const DRIFT_LABEL = "sensor-drift";
export const DRIFT_LABEL_DESCRIPTION =
  "Sensor cannot produce an edition from its declared source";
export const DRIFT_LABEL_COLOR = "B60205";
export const DRIFT_REPORT_PATH = ".research/drift/report.json";
export const DRIFT_ISSUE_TITLE = "sensor drift: cannot produce an edition";

export interface DriftEscalationPlan {
  action: "create" | "comment";
  /** Set when action is "comment": the existing open drift issue. */
  issueNumber?: number;
  title: string;
  body: string;
}

/**
 * Decide how a drift report escalates. One open issue is the dedup unit:
 * re-runs comment on it instead of re-filing. Throws TypeError if
 * reportJson is not a JSON object (the report is sensor-authored; a broken
 * report should fail the run loudly, not file a garbage issue).
 */
export function planDriftEscalation(
  reportJson: string,
  openIssueNumbers: number[],
): DriftEscalationPlan;
```

- The body embeds the report verbatim in a fenced `json` block, prefaced by
  the fixed text (framework-generic — the instance's repair contract lives
  in its sensor-repair workflow prompt, not here):

```text
The sense run could not produce an edition — the sensor is broken or its
source moved.

Drift report:

```json
<pretty-printed report>
```

Repair contract: propose a fix PR that changes the sensor only, and close
this issue via "Fixes #N" in the PR body. This issue is locked: it is
consumed by an automated repair agent, so its content is maintainer- and
sensor-authored only.
```

- [ ] **Step 1: Write the failing tests**

`src/drift.test.ts` (inject facts — no I/O, per repo test conventions):

```ts
import { describe, expect, it } from "vitest";
import { DRIFT_ISSUE_TITLE, planDriftEscalation } from "./drift";

const report = JSON.stringify({ reason: "fetch-failed", detail: "ETIMEDOUT" });

describe("planDriftEscalation", () => {
  it("creates when no drift issue is open", () => {
    const plan = planDriftEscalation(report, []);
    expect(plan.action).toBe("create");
    expect(plan.title).toBe(DRIFT_ISSUE_TITLE);
    expect(plan.body).toContain('"reason": "fetch-failed"');
    expect(plan.body).toContain("Repair contract:");
  });

  it("comments on the oldest open drift issue instead of re-filing", () => {
    const plan = planDriftEscalation(report, [17, 23]);
    expect(plan.action).toBe("comment");
    expect(plan.issueNumber).toBe(17);
  });

  it("rejects a report that is not a JSON object", () => {
    expect(() => planDriftEscalation("[]", [])).toThrow(TypeError);
    expect(() => planDriftEscalation("not json", [])).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/drift.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/drift.ts`**

```ts
/**
 * Drift escalation planner (pure). A sensor that cannot produce an edition
 * writes a drift report (DRIFT_REPORT_PATH, working tree only — never
 * committed); the escalate-drift command turns it into the single open
 * sensor-drift issue a repair workflow consumes. Proven instance-side on
 * continuous-research-sample (docs/superpowers/specs 2026-07-03 there)
 * before being promoted here.
 */

export const DRIFT_LABEL = "sensor-drift";
export const DRIFT_LABEL_DESCRIPTION =
  "Sensor cannot produce an edition from its declared source";
export const DRIFT_LABEL_COLOR = "B60205";
export const DRIFT_REPORT_PATH = ".research/drift/report.json";
export const DRIFT_ISSUE_TITLE = "sensor drift: cannot produce an edition";

export interface DriftEscalationPlan {
  action: "create" | "comment";
  issueNumber?: number;
  title: string;
  body: string;
}

export function planDriftEscalation(
  reportJson: string,
  openIssueNumbers: number[],
): DriftEscalationPlan {
  const parsed: unknown = JSON.parse(reportJson);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new TypeError("drift report must be a JSON object");
  }
  const body = [
    "The sense run could not produce an edition — the sensor is broken or its",
    "source moved.",
    "",
    "Drift report:",
    "",
    "```json",
    JSON.stringify(parsed, null, 2),
    "```",
    "",
    'Repair contract: propose a fix PR that changes the sensor only, and close',
    'this issue via "Fixes #N" in the PR body. This issue is locked: it is',
    "consumed by an automated repair agent, so its content is maintainer- and",
    "sensor-authored only.",
  ].join("\n");
  const oldest = openIssueNumbers.length > 0 ? Math.min(...openIssueNumbers) : undefined;
  return oldest === undefined
    ? { action: "create", title: DRIFT_ISSUE_TITLE, body }
    : { action: "comment", issueNumber: oldest, title: DRIFT_ISSUE_TITLE, body };
}
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/drift.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/drift.ts src/drift.test.ts
git commit -m "drift: pure escalation planner (one open issue = dedup unit)"
```

### Task 4: issue operations on the GitHub port

**Files:**
- Modify: `src/ports.ts` (extend `GitHubPort`)
- Modify: `src/github.ts` (Octokit adapter)
- Test: `src/github.test.ts` (follow its existing adapter-test style —
  if the file stubs Octokit, mirror that; if adapter methods are untested
  there, add at least the request-shape tests it uses for other writes)

**Interfaces:**
- Produces (port additions; exact signatures consumed by Task 5):

```ts
  // --- issues (drift escalation) ---
  /** Numbers of OPEN issues carrying the given label. */
  listOpenIssueNumbersByLabel(label: string): Promise<number[]>;
  /** Create-or-update the label (idempotent). */
  ensureLabel(name: string, description: string, color: string): Promise<void>;
  /** Opens an issue, returns its number. */
  createIssue(title: string, body: string, labels: string[]): Promise<number>;
  commentOnIssue(issueNumber: number, body: string): Promise<void>;
  /** Locks the conversation; idempotent (REST lock returns 204 either way). */
  lockIssue(issueNumber: number): Promise<void>;
```

- [ ] **Step 1: Add the five methods to `GitHubPort`** in `src/ports.ts`
  under a `// --- issues (drift escalation) ---` divider, exactly as above.

- [ ] **Step 2: Run typecheck to see the adapter fail** —
`npm run typecheck` — Expected: `OctokitGitHubPort` no longer satisfies the
port.

- [ ] **Step 3: Implement in `src/github.ts`** (octokit REST):

```ts
  async listOpenIssueNumbersByLabel(label: string): Promise<number[]> {
    const { data } = await this.octokit.rest.issues.listForRepo({
      owner: this.owner,
      repo: this.repo,
      labels: label,
      state: "open",
    });
    // listForRepo returns PRs too; drift issues are plain issues.
    return data.filter((i) => !i.pull_request).map((i) => i.number);
  }

  async ensureLabel(name: string, description: string, color: string): Promise<void> {
    try {
      await this.octokit.rest.issues.createLabel({
        owner: this.owner,
        repo: this.repo,
        name,
        description,
        color,
      });
    } catch (err) {
      if ((err as { status?: number }).status !== 422) throw err; // 422 = exists
    }
  }

  async createIssue(title: string, body: string, labels: string[]): Promise<number> {
    const { data } = await this.octokit.rest.issues.create({
      owner: this.owner,
      repo: this.repo,
      title,
      body,
      labels,
    });
    return data.number;
  }

  async commentOnIssue(issueNumber: number, body: string): Promise<void> {
    await this.octokit.rest.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      body,
    });
  }

  async lockIssue(issueNumber: number): Promise<void> {
    await this.octokit.rest.issues.lock({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
    });
  }
```

Match the class's actual field names when you open the file (`this.octokit`
/ `this.owner` / `this.repo` may differ — mirror the existing methods).

- [ ] **Step 4: Update the fake port(s).** `npm run typecheck` will list
every fake implementing `GitHubPort` (commands.test.ts / flows.test.ts /
site tests). Give fakes recording implementations, e.g. arrays
`createdIssues: {title, body, labels}[]`, `lockedIssues: number[]`, and a
settable `openDriftIssues: number[]` returned by
`listOpenIssueNumbersByLabel`.

- [ ] **Step 5: Run** `npm run check` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ports.ts src/github.ts src/github.test.ts src/*.test.ts
git commit -m "ports: issue operations for drift escalation"
```

### Task 5: `escalate-drift` command + CLI wiring

**Files:**
- Modify: `src/commands.ts` (new `escalateDrift`)
- Modify: `src/cli.ts` (subcommand), `src/help.ts` (usage line)
- Modify: `src/index.ts` if it re-exports commands (mirror neighbors)
- Test: `src/commands.test.ts`, `src/help.test.ts`

**Interfaces:**
- Consumes: Task 3 planner, Task 4 port methods.
- Produces:

```ts
export interface EscalateDriftDeps {
  github: GitHubPort;
  /** UTF-8 report content, or null when no report exists (the no-drift case). */
  readReport: () => Promise<string | null>;
  log: (message: string) => void;
}

export type EscalateDriftOutcome =
  | { outcome: "no-drift" }
  | { outcome: "created"; issueNumber: number }
  | { outcome: "commented"; issueNumber: number };

export async function escalateDrift(deps: EscalateDriftDeps): Promise<EscalateDriftOutcome>;
```

- Behavior: null report → `no-drift` (log + return; exit 0 — a normal sense
  run has no report). Otherwise: `ensureLabel(DRIFT_LABEL, …)`, list open
  drift issues, `planDriftEscalation`, execute create or comment, then
  `lockIssue` on the touched issue number **always** (create and comment
  paths both — locking is idempotent and re-asserts the containment).

- [ ] **Step 1: Write the failing tests** in `src/commands.test.ts`, using
the fake port from Task 4:

```ts
describe("escalateDrift", () => {
  const report = JSON.stringify({ reason: "fetch-failed", detail: "x" });

  it("no-ops without a report", async () => {
    const github = new FakeGitHubPort();
    const out = await escalateDrift({ github, readReport: async () => null, log: () => {} });
    expect(out).toEqual({ outcome: "no-drift" });
    expect(github.createdIssues).toHaveLength(0);
  });

  it("creates, labels, and locks the first drift issue", async () => {
    const github = new FakeGitHubPort(); // fake returns e.g. number 42 on create
    const out = await escalateDrift({ github, readReport: async () => report, log: () => {} });
    expect(out).toEqual({ outcome: "created", issueNumber: 42 });
    expect(github.createdIssues[0].labels).toContain("sensor-drift");
    expect(github.lockedIssues).toContain(42);
  });

  it("comments on and re-locks an existing open drift issue", async () => {
    const github = new FakeGitHubPort();
    github.openDriftIssues = [17];
    const out = await escalateDrift({ github, readReport: async () => report, log: () => {} });
    expect(out).toEqual({ outcome: "commented", issueNumber: 17 });
    expect(github.issueComments[0].issueNumber).toBe(17);
    expect(github.lockedIssues).toContain(17);
  });
});
```

Adjust fake-construction syntax to whatever Task 4 actually built.

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/commands.test.ts`

- [ ] **Step 3: Implement `escalateDrift`** in `src/commands.ts`:

```ts
export async function escalateDrift(deps: EscalateDriftDeps): Promise<EscalateDriftOutcome> {
  const report = await deps.readReport();
  if (report === null) {
    deps.log("escalate-drift: no drift report — nothing to do");
    return { outcome: "no-drift" };
  }
  await deps.github.ensureLabel(DRIFT_LABEL, DRIFT_LABEL_DESCRIPTION, DRIFT_LABEL_COLOR);
  const open = await deps.github.listOpenIssueNumbersByLabel(DRIFT_LABEL);
  const plan = planDriftEscalation(report, open);
  let issueNumber: number;
  if (plan.action === "create") {
    issueNumber = await deps.github.createIssue(plan.title, plan.body, [DRIFT_LABEL]);
    deps.log(`escalate-drift: opened issue #${issueNumber}`);
  } else {
    issueNumber = plan.issueNumber!;
    await deps.github.commentOnIssue(issueNumber, plan.body);
    deps.log(`escalate-drift: commented on open issue #${issueNumber}`);
  }
  // Locked always: the issue is agent-consumed instructions; on a public
  // repo an open comment thread is a prompt-injection channel (sample
  // hardening, 2026-07-07).
  await deps.github.lockIssue(issueNumber);
  const outcome = plan.action === "create" ? "created" : "commented";
  return { outcome, issueNumber } as EscalateDriftOutcome;
}
```

- [ ] **Step 4: Wire the CLI.** In `src/cli.ts`, add a subcommand case
mirroring the existing `sense`/`record-decline` wiring: build the port via
`createGitHubPortFromEnv(process.env)`, and

```ts
readReport: async () => {
  try {
    return await readFile(DRIFT_REPORT_PATH, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
},
```

Add the command to `src/help.ts` usage text:
`escalate-drift   file/refresh the locked sensor-drift issue from .research/drift/report.json`
and update `src/help.test.ts` expectations.

- [ ] **Step 5: Run** `npm run check` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/commands.ts src/commands.test.ts src/cli.ts src/help.ts src/help.test.ts src/index.ts
git commit -m "cli: escalate-drift promotes the sample's drift escalation into the engine"
```

### Task 6: scaffold the drift step + `sensor-repair.yml` template

**Files:**
- Modify: `src/scaffold.ts` (extend `SENSE_WORKFLOW`, add
  `SENSOR_REPAIR_WORKFLOW`, extend `scaffoldFiles()` and `NEXT_STEPS`)
- Test: `src/scaffold.test.ts`

**Interfaces:**
- Consumes: the `escalate-drift` CLI command (Task 5).
- Produces: `scaffoldFiles()` additionally returns
  `{ path: ".github/workflows/sensor-repair.yml", content: SENSOR_REPAIR_WORKFLOW }`.
- Reminder: escape every Actions expression as `\${{ ... }}` inside the TS
  template literals.
- NOTE: this task writes templates in the *current* (tag-ref, node 22)
  style; Task 7 hardens all templates in one pass. Keeping the passes
  separate keeps each diff reviewable.

- [ ] **Step 1: Write the failing tests** in `src/scaffold.test.ts`
(follow its existing content-assertion style):

```ts
it("sense template escalates drift after the engine run", () => {
  const sense = fileContent(".github/workflows/sense.yml");
  expect(sense).toContain("escalate-drift");
  // Escalation runs on the App token (issues write), same as the engine.
  expect(sense.indexOf("escalate-drift")).toBeGreaterThan(sense.indexOf("app-token"));
});

it("scaffolds the optional sensor-repair workflow", () => {
  const repair = fileContent(".github/workflows/sensor-repair.yml");
  expect(repair).toContain("anthropics/claude-code-action");
  expect(repair).toContain("allowed_bots");
  expect(repair).toContain("needs: repair"); // two-job token isolation
  // Actions expressions survived TS-template escaping into the output:
  expect(repair).toContain("${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}");
  expect(repair).toContain("${GH_TOKEN}"); // shell brace expansion intact too
});
```

(`fileContent` = however the test file currently indexes `scaffoldFiles()`.)

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/scaffold.test.ts`

- [ ] **Step 3: Extend `SENSE_WORKFLOW`.** After the `sense` step, append:

```yaml
      - name: Escalate drift
        # If the sensor wrote .research/drift/report.json (working-tree
        # only), file/refresh the single LOCKED sensor-drift issue the
        # repair workflow consumes. No report -> no-op.
        env:
          GITHUB_TOKEN: \${{ steps.app-token.outputs.token }}
        run: npx --yes github:norabble/continuous-research#v0.1.5 escalate-drift
```

- [ ] **Step 4: Add `SENSOR_REPAIR_WORKFLOW`** — the sample's proven
two-job shape, generalized. Full template content (as a TS template
literal; note the `\${{ }}` escapes):

```yaml
name: sensor-repair

# OPTIONAL — Claude Code integration (delete this file if you don't use it).
# Generated by \`continuous-research init\`. The framework is engine-
# agnostic; this workflow is a documented integration with
# anthropics/claude-code-action, proven on continuous-research-sample.
#
# Agentic code fix for sensor drift, split into two jobs so the agent never
# holds a write-capable token:
#   repair — the agent researches a replacement source and edits the sensor
#            in the working tree (read-only GITHUB_TOKEN), then leaves its
#            fix as an uploaded artifact (patch + PR text).
#   ship   — deterministic: re-applies the patch (sensor file only,
#            enforced mechanically), re-runs tests, then pushes the branch
#            and opens/updates the PR with a freshly minted, downscoped App
#            token. "Re-run failed jobs" retries ship without a new agent
#            run.
# The agent reads untrusted content (the drift issue, live API responses)
# with open egress, so nothing in its environment may be worth stealing.
on:
  issues:
    types: [labeled]
  workflow_dispatch:
    inputs:
      issue_number:
        description: "Open sensor-drift issue number to repair against"
        required: true

permissions:
  contents: read

concurrency:
  group: sensor-repair
  cancel-in-progress: false

jobs:
  repair:
    if: github.event_name == 'workflow_dispatch' || github.event.label.name == 'sensor-drift'
    runs-on: ubuntu-latest
    timeout-minutes: 25
    permissions:
      contents: read
      issues: read
    steps:
      - uses: actions/checkout@v4
        with:
          # No credentials in .git/config for the agent's Bash to find.
          persist-credentials: false
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      - uses: anthropics/claude-code-action@v1
        with:
          claude_code_oauth_token: \${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          # Read-only, passed explicitly: otherwise the action mints a
          # token from a Claude App installation, which may carry write
          # scopes — exactly what this two-job structure exists to avoid.
          github_token: \${{ secrets.GITHUB_TOKEN }}
          # TODO: your GitHub App's slug — the actor that labels drift
          # issues. Never "*" on a public repo.
          allowed_bots: "your-app-slug"
          claude_args: |
            --max-turns 40
            --allowedTools "Read,Glob,Grep,Edit,Write,WebFetch,Bash(curl:*),Bash(node:*),Bash(git status:*),Bash(git diff:*),Bash(git log:*),Bash(gh issue view:*)"
          prompt: |
            You are the sensor-repair agent for this Continuous Research
            instance. Drift issue: #\${{ github.event.issue.number || inputs.issue_number }}.

            Read that issue first (the drift report is embedded in it),
            then the sensor and its config.
            TODO: list your instance's sensor file(s) and any constraint
            files the agent must respect (e.g. a source blocklist), and
            name a few candidate replacement sources to evaluate first.

            Task: the sensor's declared source is unusable. Find a usable
            replacement source, verify it by actually fetching it and
            inspecting the real response, then edit the sensor file ONLY so
            the sensor works against the new source. Run the project's
            tests and the sensor itself and make both pass.
            TODO: name the sensor file and the exact test/run commands.

            Do NOT commit, push, or open a pull request — a follow-up job
            ships your working-tree change. Finish by writing three files
            into a repair-out/ directory in the workspace:
            - repair-out/branch — one line: fix/sensor-<new-source-host>
            - repair-out/title — one line, the PR title.
            - repair-out/body.md — the PR body: the evidence trail (chosen
              source, a trimmed sample of its real response, why it fits).
              No "Fixes #N" line; the ship job appends it.
      - name: Collect the repair artifact
        # TODO: replace sensor.mjs with your sensor file (both lines). The
        # pathspec is the mechanical write-surface constraint: edits to any
        # other file do not ship.
        run: |
          mkdir -p "$RUNNER_TEMP/repair-artifact"
          git diff -- sensor.mjs > "$RUNNER_TEMP/repair-artifact/sensor.patch"
          if [ ! -s "$RUNNER_TEMP/repair-artifact/sensor.patch" ]; then
            echo "::error::agent made no change to the sensor"
            exit 1
          fi
          for f in branch title body.md; do
            if [ ! -s "repair-out/$f" ]; then
              echo "::error::agent did not write repair-out/$f"
              exit 1
            fi
            cp "repair-out/$f" "$RUNNER_TEMP/repair-artifact/$f"
          done
      - uses: actions/upload-artifact@v7
        with:
          name: sensor-repair-output
          path: \${{ runner.temp }}/repair-artifact
          if-no-files-found: error
          retention-days: 7

  ship:
    needs: repair
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      - uses: actions/download-artifact@v8
        with:
          name: sensor-repair-output
          path: \${{ runner.temp }}/repair-artifact
      - name: Apply and verify the patch
        # TODO: replace sensor.mjs (twice) and \`node --test\` with your
        # sensor file and test command.
        run: |
          branch="$(head -n1 "$RUNNER_TEMP/repair-artifact/branch")"
          if ! printf '%s' "$branch" | grep -Eq '^fix/sensor-[A-Za-z0-9.-]+$'; then
            echo "::error::branch name does not match fix/sensor-<host>: $branch"
            exit 1
          fi
          echo "BRANCH=$branch" >> "$GITHUB_ENV"
          git apply --include=sensor.mjs "$RUNNER_TEMP/repair-artifact/sensor.patch"
          changed="$(git diff --name-only)"
          if [ "$changed" != "sensor.mjs" ]; then
            echo "::error::patch changed more than the sensor: $changed"
            exit 1
          fi
          node --test
      - name: Mint App installation token
        id: app-token
        uses: actions/create-github-app-token@v2
        with:
          app-id: \${{ secrets.CONTINUOUS_RESEARCH_APP_ID }}
          private-key: \${{ secrets.CONTINUOUS_RESEARCH_APP_PRIVATE_KEY }}
          # Exactly what shipping needs; minted only after the agent exited.
          permission-contents: write
          permission-pull-requests: write
      - name: Push the fix branch and open or update the PR
        # TODO: replace the bot git identity with your App's
        # (<app-id>+<app-slug>[bot]@users.noreply.github.com), and
        # sensor.mjs with your sensor file.
        env:
          GH_TOKEN: \${{ steps.app-token.outputs.token }}
          ISSUE_NUMBER: \${{ github.event.issue.number || inputs.issue_number }}
        run: |
          title="$(head -n1 "$RUNNER_TEMP/repair-artifact/title")"
          body="$RUNNER_TEMP/repair-artifact/body.md"
          printf '\nFixes #%s.\n' "$ISSUE_NUMBER" >> "$body"
          git config user.name "your-app-slug[bot]"
          git config user.email "TODO+your-app-slug[bot]@users.noreply.github.com"
          git remote set-url origin "https://x-access-token:\${GH_TOKEN}@github.com/\${GITHUB_REPOSITORY}.git"
          git checkout -B "$BRANCH"
          git add sensor.mjs
          git commit -m "$title"
          git push --force origin "$BRANCH"
          existing="$(gh pr list --head "$BRANCH" --state open --json number --jq '.[0].number // empty')"
          if [ -n "$existing" ]; then
            gh pr edit "$existing" --title "$title" --body-file "$body"
          else
            gh pr create --head "$BRANCH" --title "$title" --body-file "$body"
          fi
```

Escaping rule for the TS template literal: escape every `${` as `\${` —
that covers both Actions expressions (`\${{ secrets... }}`) and shell brace
expansions (`\${GH_TOKEN}`, `\${GITHUB_REPOSITORY}`). Brace-free shell
forms (`$RUNNER_TEMP`, `$branch`) and command substitution `$(...)` need no
escaping. The YAML above already shows the `\${{ }}` escapes; add the
`\${` escapes on the shell lines when transcribing.

- [ ] **Step 5: Register + document.** Add to `scaffoldFiles()`:
`{ path: ".github/workflows/sensor-repair.yml", content: SENSOR_REPAIR_WORKFLOW }`.
Extend `NEXT_STEPS` with:

```
  6. Sensor repair (optional, Claude Code): if you keep
     .github/workflows/sensor-repair.yml, set CLAUDE_CODE_OAUTH_TOKEN and
     fill in its TODOs (app slug, sensor file, candidate sources); your
     sensor must write .research/drift/report.json when it cannot produce
     an edition. Delete the file to opt out.
```

- [ ] **Step 6: Run** `npm run check` — Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/scaffold.ts src/scaffold.test.ts
git commit -m "scaffold: drift escalation step + optional sensor-repair workflow"
```

---

## Stage C — scaffold hardening + docs

### Task 7: harden every scaffold template

**Files:**
- Modify: `src/scaffold.ts`
- Test: `src/scaffold.test.ts`

**Interfaces:** none new — template content changes only.

- [ ] **Step 1: Write the failing tests**

```ts
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
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/scaffold.test.ts`

- [ ] **Step 3: Apply the hardening to each template.**

Across ALL templates (sense, decline, site, sensor-repair):
- Replace every `uses: <action>@vN` with the pinned form from the SHA table
  in the plan header, keeping the tag as a trailing comment, e.g.
  `uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4`.

`SENSE_WORKFLOW`, `DECLINE_WORKFLOW`, `SITE_WORKFLOW` additionally:
- `node-version: "22"` → `node-version: "24" # npm 11: npm 10 (node 22)
  cannot install commit-pinned git deps` (the comment matters — it stops a
  well-meaning downgrade).

`SENSE_WORKFLOW`: downscope the mint —

```yaml
          app-id: \${{ secrets.CONTINUOUS_RESEARCH_APP_ID }}
          private-key: \${{ secrets.CONTINUOUS_RESEARCH_APP_PRIVATE_KEY }}
          # Downscope to the sensing loop's needs: push data branches, open
          # data-PRs, file/lock the drift issue.
          permission-contents: write
          permission-issues: write
          permission-pull-requests: write
```

`DECLINE_WORKFLOW`: change `permissions:` to read-only —

```yaml
# The decline record lands on main. If main carries a ruleset, GITHUB_TOKEN
# can never bypass it — the App can. The workflow's own token stays
# read-only either way.
permissions:
  contents: read
  issues: read
  pull-requests: read
```

— and insert a mint step before `record-decline`, then point the engine at
it:

```yaml
      - name: Mint App installation token
        id: app-token
        uses: actions/create-github-app-token@fee1f7d63c2ff003460e3d139729b119787bc349 # v2
        with:
          app-id: \${{ secrets.CONTINUOUS_RESEARCH_APP_ID }}
          private-key: \${{ secrets.CONTINUOUS_RESEARCH_APP_PRIVATE_KEY }}
          permission-contents: write
          permission-issues: read
          permission-pull-requests: read
      - name: record-decline
        env:
          GITHUB_TOKEN: \${{ steps.app-token.outputs.token }}
        run: npx --yes github:norabble/continuous-research#v0.1.5 record-decline
```

`SITE_WORKFLOW`: replace the `upload-pages-artifact` step with the inlined
pair (keep the existing `hashFiles` guards on all three trailing steps):

```yaml
      # Inlined actions/upload-pages-artifact: the composite calls
      # actions/upload-artifact by tag internally, which repos enforcing
      # required SHA pinning reject (the policy applies to nested
      # references). These two steps are exactly what the composite does.
      - name: Package site for Pages
        if: hashFiles('_site/**') != ''
        run: tar --dereference --hard-dereference -cvf "$RUNNER_TEMP/artifact.tar" -C _site .
      - uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7
        if: hashFiles('_site/**') != ''
        with:
          name: github-pages
          path: \${{ runner.temp }}/artifact.tar
          retention-days: 1
          if-no-files-found: error
      - id: deploy
        if: hashFiles('_site/**') != ''
        uses: actions/deploy-pages@d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e # v4
```

- [ ] **Step 4: Run** `npm run check` — Expected: PASS. Also eyeball one
generated file end-to-end:
`npm run cli -- init --dry-run 2>/dev/null || npx tsx src/cli.ts init` in a
temp dir (check how `init` is actually invoked in cli.ts first) and read
the emitted `sense.yml` — every `\${{ }}` must have survived as `${{ }}`.

- [ ] **Step 5: Commit**

```bash
git add src/scaffold.ts src/scaffold.test.ts
git commit -m "scaffold: hardened templates (SHA pins, node 24, App-token main-writes, inlined Pages upload)"
```

### Task 8: docs — drift contract, CLI reference, go-public checklist

**Files:**
- Modify: `docs/cli.md` (new `escalate-drift` section + drift-report
  contract)
- Modify: `docs/adopting.md` (going-public checklist; SHA-pinning notes)
- Modify: `docs/backlog.md` (prune what this plan and the 2026-07-07
  session resolved)

**Interfaces:** none — prose. Keep ~80-col hand-wrapping; don't reflow
untouched text.

- [ ] **Step 1: `docs/cli.md`.** Add an `escalate-drift` command section
beside `sense`/`record-decline` documenting: reads
`.research/drift/report.json` (must be a JSON object; recommended fields
`reason`, `detail`, plus anything the sensor wants embedded); no-ops
without it; maintains ONE open, LOCKED `sensor-drift` issue (create on
first drift, comment on re-runs, re-lock always); needs a token with
Issues read/write (`GITHUB_TOKEN` env var, normally the App token).
Document the drift-report contract in the sensor-contract section: a
sensor that cannot produce an edition writes the report (working tree
only, never committed) and still emits `{"changed": false}` with exit 0.

- [ ] **Step 2: `docs/adopting.md`.** Add a "Going public" section — the
checklist proven on the sample, in order:

1. Before flipping: lock down the agent-consumed surfaces (the scaffold
   already locks drift issues); confirm no secrets in history.
2. Flip visibility, then immediately:
   - Ruleset on `main`: require PRs, block force-push/deletion. Bypass
     actors: the repo admin and YOUR APP ONLY — `GITHUB_TOKEN` can never
     bypass a ruleset, which is why the scaffolded decline/sense workflows
     write via the App token.
   - Actions → General → require approval for outside collaborators'
     fork PRs.
   - Enable secret scanning + push protection.
   - Optionally enable "require actions to be pinned to a full-length
     commit SHA" — the scaffolded workflows already comply, including the
     inlined Pages upload (the stock `upload-pages-artifact` composite
     fails this policy via its nested tag reference).
3. Then enable the site (config `site.enabled`, Pages source "GitHub
   Actions").

Also extend the existing upgrade/SHA-pinning passage with the empirical
caveat: engine refs pinned to a bare commit require node 24 in the
workflow (npm 10 cannot install commit-pinned git deps; archive tarballs
skip `prepare` and are not a workaround).

- [ ] **Step 3: `docs/backlog.md`.** Update entries this work closes or
absorbs: "Document SHA pinning as hardened mode" (now in adopting.md —
remove), "Sample repo public flip" (done 2026-07-07 — remove), and the
go-public checklist item (absorbed into adopting.md — remove). Leave the
tag-ruleset, npm-publish, vendored-bundle, signed-tags, and site-cleanup
items untouched.

- [ ] **Step 4: Run** `npm run check` (format check covers nothing in
docs — prettier ignores markdown — but run it anyway before committing).

- [ ] **Step 5: Commit**

```bash
git add docs/cli.md docs/adopting.md docs/backlog.md
git commit -m "docs: drift contract, escalate-drift reference, going-public checklist"
```

### Task 9: release prep (no tag/publish — maintainer's call)

**Files:**
- Modify: `package.json` (version → `0.1.6`)
- Modify: `src/scaffold.ts` (both `#v0.1.5` engine refs → `#v0.1.6`)
- Modify: `README.md` / `docs/cli.md` if they cite `#v0.1.5` (grep).

- [ ] **Step 1:** `grep -rn "v0\.1\.5" package.json src docs README.md` and
bump every engine-ref occurrence plus the package version to `0.1.6`.
- [ ] **Step 2:** `npm run check` — Expected: PASS.
- [ ] **Step 3:** Commit `chore: prep v0.1.6 (sample-learnings release)`.
- [ ] **Step 4:** STOP. Tagging `v0.1.6`, pushing, and merging
`sample-learnings-v1` are the maintainer's release decisions — surface the
branch and wait.

---

## Follow-ups deliberately NOT in this plan (sample repo, separate session)

- Point the sample's `sense.yml` escalation step at the engine's
  `escalate-drift` (replacing its hand-rolled shell) once v0.1.6 exists,
  and bump the sample's pinned engine SHA.
- Re-render the sample site (dispatch `site`) after upgrading, to confirm
  the README.md-style links now point at GitHub.
- Re-qualify the restructured sensor-repair on the next drift re-fire
  (agent must write `repair-out/`, ship job must push/PR cleanly with the
  downscoped token).
- Framework backlog items untouched here: tag ruleset on `v*`, npm
  publish, vendored-bundle reframing, signed tags, site-cleanup ticket,
  impact-declaration ordering.

# Adoption Readiness + token-source-review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the CLI + GitHub App adoptable by projects that are not this
maintainer's, prove it by having an isolated agent build the
`token-source-review` instance from public information alone, and close every
documentation gap that agent hits by fixing the *public sources* (never its
project directly).

**Architecture:** Part A polishes the CLI (`--version`, real `--help`) and adds
two documents — a CLI/engine reference (`docs/cli.md`) and an adoption guide
(`docs/adopting.md`) — then releases `v0.1.2` so the public `npx github:` pin
carries the polish. Part B dispatches a *fresh* (context-free) agent to build
`token-source-review` per its own `PLAN.md`, restricted to public sources; the
monitor (this session) fixes blockers by pushing doc/engine fixes to the public
framework repo and resuming the agent.

**Tech Stack:** TypeScript ESM (strict) · Node ≥ 22 · vitest · tsup ·
Octokit · gh-aw (instance side) · `gh` CLI.

## Global Constraints

- ESM only; `import type` for type-only imports (`verbatimModuleSyntax`).
- Prettier owns formatting; markdown is prettier-ignored — hand-wrap ~80 col.
- CONCEPT.md canonical vocabulary only: descriptor, label, edition, data-PR,
  provenance stub, decline record. No synonyms.
- Ports-and-adapters: pure cores stay I/O-free; I/O behind `src/ports.ts`.
- `npm run check` must pass before every commit.
- Commit trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Push over HTTPS (`gh` credential helper); SSH has no key in this env.
- The isolated agent must never read the local `continuous-research` or
  `continuous-research-sample` checkouts — only their public GitHub surfaces,
  plus its own project directory.
- **Do not create any new public repo without the maintainer's explicit
  confirmation** — `token-source-review` starts **private**.

---

## Part A — adoption readiness (framework repo)

### Task 1: CLI polish — `--version` and real `--help`

**Files:**
- Create: `src/help.ts`, `src/help.test.ts`
- Modify: `src/cli.ts`

**Interfaces:**
- Produces: `helpText(version: string): string` (pure, exported from
  `src/help.ts`); `CLI_COMMANDS: ReadonlyArray<{ name: string; summary: string }>`.

Gaps today: `--help` prints only a bare command list; there is no `--version`
at all — an adopter running via `npx github:…#vX` cannot confirm what they got.

- [x] **Step 1: Failing test** — `src/help.test.ts`: `helpText("0.1.2")`
      contains the version, each of `init`/`sense`/`record-decline` with a
      one-line summary, the env vars `GITHUB_TOKEN`/`GITHUB_REPOSITORY`, and a
      pointer to `docs/cli.md`.
- [x] **Step 2: Run** `npx vitest run src/help.test.ts` — FAIL (module absent).
- [x] **Step 3: Implement** `src/help.ts` (pure string builder; summaries:
      init = "scaffold .research/ + workflows into the current repo",
      sense = "run the declared sensor, dedup, propose the data-PR",
      record-decline = "commit the decline record for a closed-unmerged data-PR").
- [x] **Step 4: Wire `cli.ts`**: `--version`/`-v` prints the package version
      (`createRequire(import.meta.url)("../package.json").version` — resolves
      from both `src/` and `dist/`); `--help`/`-h`/no-arg prints `helpText`.
- [x] **Step 5:** `npm run check` — PASS. Commit
      (`cli: add --version and a real --help`).

### Task 2: `docs/cli.md` — CLI + engine reference

**Files:** Create: `docs/cli.md`; Modify: `README.md` (link it — done in Task 4).

Complete reference, all facts from source (verified 2026-07-03):

- [x] **Step 1: Write `docs/cli.md`** covering:
  - **Invocation**: `npx --yes github:norabble/continuous-research#vX.Y.Z <cmd>`;
    local dev `npm run cli -- <cmd>`; vendored-bundle fallback.
  - **`init`** — writes (never overwrites) `.research/config.json`,
    `.github/workflows/{sense.yml,decline.yml,interpretation.md,comment-resolution.md}`,
    prints next steps.
  - **`sense`** — needs `GITHUB_TOKEN` (or `GH_TOKEN`) + `GITHUB_REPOSITORY`
    (`owner/repo`); runs the declared sensor; outcomes `none | skip(state) | proposed`.
  - **`record-decline`** — needs `GITHUB_EVENT_PATH` (Actions provides it) +
    token/repo env; no-ops unless closed-unmerged with a `data:` label; reason =
    latest trusted comment, else default text.
  - **Config schema** (`.research/config.json`): `{ "sensor": "<shell command>" }`.
  - **Sensor contract** (stdout JSON): `{ "changed": false }` or
    `{ changed, descriptor, source, retrievedAt, hash, artifacts[] }`; artifacts
    are working-tree paths the engine reads and commits.
  - **Descriptor constraint**: `/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/`.
  - **What the engine writes**: branch `data/<descriptor>`, label
    `data:<descriptor>`, PR title `data: <descriptor>`, provenance stub
    `.research/provenance/<descriptor>.json`
    (schema `continuous-research/provenance@v1`), decline record
    `.research/decisions/<descriptor>.md` (YAML frontmatter + reason body).
  - **Dedup semantics** table (merged/pending/declined/new → skip/propose;
    precedence merged > pending > declined).
  - **Exit codes**: 0 success/no-op, 1 error (message on stderr).
- [x] **Step 2:** `npm run check`; commit (`docs: CLI + engine reference`).

### Task 3: `docs/adopting.md` — the adoption guide

**Files:** Create: `docs/adopting.md`.

The "separate MD file describing how to install in a new or existing project".
Sections (facts from the proven sample config + scaffold NEXT_STEPS):

- [x] **Step 1: Write `docs/adopting.md`**:
  1. **What you get / what you provide** (framework vs the three hooks).
  2. **Prerequisites** — GitHub repo (public, or private within Actions
     minutes), Node ≥ 22 in CI, `gh` + `gh-aw` extension, an inference
     credential for the agent layer.
  3. **Quickstart — new or existing project** — run `init`, point
     `config.json` `sensor` at a command honoring the contract, uncomment the
     cron.
  4. **GitHub App (required)** — why (default-token PRs never trigger the
     interpretation workflow); create an App (permissions: Contents, Issues,
     Pull requests — read & write), install on the repo, set `APP_ID` +
     `APP_PRIVATE_KEY` secrets; or extend an existing installation
     (Settings → GitHub Apps → Configure → add repository; or
     `gh api --method PUT /user/installations/<id>/repositories/<repo_id>`).
  5. **Repo/org settings** — "Allow GitHub Actions to create and approve pull
     requests" (repo *and* org level).
  6. **Agent layer** — fill the two `TODO`s in `interpretation.md` /
     `comment-resolution.md`; engine/model choice with the quota empirics
     (gemini-3.1-flash-lite proven, ~16–25 requests/session, 500 RPD; 20-RPD
     models have no headroom); set the inference secret; `gh aw compile`;
     commit the `.lock.yml` files.
  7. **First run — verification** — dispatch `sense`; walk the three dedup
     states; what a healthy run of each workflow looks like.
  8. **Guardrails** — timeouts, concurrency, `allowed-files` +
     `protected-files: allowed`, cron-matches-data-rhythm, fail-closed quota.
  9. **Troubleshooting** — interpretation never fires (token identity, App
     slug in `bots:`), org blocks Actions PRs, `gh aw compile` errors, npx
     against a renamed/private framework, sensor JSON parse errors.
- [x] **Step 2:** `npm run check`; commit (`docs: adoption guide`).

### Task 4: README truth-up + doc links

**Files:** Modify: `README.md`.

- [x] **Step 1:** comment-resolution row → **built** (F4, qualified live
      2026-07-03); replace the stale "Status (Phase 1, closing)" blockquote and
      bottom "Status" section with Phase-1-complete wording; add a **Docs**
      section linking `docs/cli.md` + `docs/adopting.md` (adopters land here
      first — the links are the point).
- [x] **Step 2:** `npm run check`; commit (`docs: README truth-up`).

### Task 5: release v0.1.2

**Files:** Modify: `package.json`, `src/scaffold.ts` (2 npx pins),
`src/scaffold.test.ts` (pin expectations).

- [x] **Step 1:** bump version to `0.1.2`; update both scaffold `npx` pins
      `#v0.1.1` → `#v0.1.2`; update test expectations.
- [x] **Step 2:** `npm run check` — PASS.
- [x] **Step 3:** commit (`Release v0.1.2: --version/--help + adoption docs`),
      tag `v0.1.2`, push `main` + tag (HTTPS).
- [x] **Step 4: Verify the public path** from an empty scratch dir:
      `npx --yes github:norabble/continuous-research#v0.1.2 --version` → `0.1.2`;
      `--help` shows the Task-1 text; raw.githubusercontent.com serves both new
      docs.

## Part B — token-source-review via an isolated agent

### Task 6: dispatch the builder agent (P0 milestone)

**Files:** none here — the agent works in the `token-source-review`
working directory only.

- [x] **Step 1:** Dispatch a **general-purpose** agent (NOT a fork — a fork
      inherits this session's private context, violating the public-only rule)
      with: workspace = the `token-source-review` checkout; spec = its
      `PLAN.md` (P0: git init, scaffold via the *public*
      `npx github:norabble/continuous-research#v0.1.2 init`, seed
      `.research/sources.json` for the four providers, write the deterministic
      trip-wire sensor + tests, run the engine locally against a **private**
      `norabble/token-source-review` repo it creates with `gh`).
      Allowed sources: `https://github.com/norabble/continuous-research`
      (docs *first*; note every time source-reading or guessing was required —
      each is a docs gap), the public sample repo, provider docs pages, its own
      directory. Forbidden: the two local checkouts above.
      Required output: what works, exact blockers, docs-gap list.

### Task 7: monitor loop — fix public sources, resume

- [x] **Step 1:** Triage the agent's report. For each blocker/gap: fix in the
      *framework repo* (docs/cli.md, docs/adopting.md, scaffold templates, or
      engine code if it's a real defect), `npm run check`, commit, push — the
      fix must be live on GitHub before resuming. Never edit
      `token-source-review` files myself.
- [x] **Step 2:** `SendMessage` the agent to continue (same agent, context
      intact) into P1 (interpretation workflow authored + compiled; findings.md
      seeded with the 2026-07-02 engine-empirics claims) and as much of P2 as
      needs no human credentials.
- [x] **Step 3:** Iterate until the agent is done or blocked only on
      maintainer-only actions (App installation on the new repo, inference
      secret values). Collect those into the final report.

### Task 8: wrap-up

- [x] **Step 1:** Final summary — Part A shipped state, agent progress, the
      exact remaining human actions, and every docs gap found + how it was
      fixed publicly.

# Continuous Research — Phase 1 Build Plan

> Derived from [`CONCEPT.md`](../CONCEPT.md). This plan executes the **Phase 1**
> scope defined there (*Phasing → Phase 1*). It does not re-state the concept —
> it points to it. Specifics CONCEPT deferred (schemas, grammars, the descriptor
> *scheme*, the package name) stay deferred here too: this is a work-breakdown
> and a set of seam rules, not a spec.
>
> **Status:** Draft for review. **Last updated:** 2026-06-26

## Context

The concept design is complete (Q-A–Q-E settled). Phase 1 turns it into a
**working prototype of the continuous loop**, validated by a *trivial* test
instance — *before* the real sample/demo project (a separate repo, designed
later with the maintainer).

**Locked decisions:**
- **Distribution = B/C** — a single published package that is *both* the config
  CLI *and* the runtime engine; thin generated workflows call it. (Rationale and
  the rejected reusable-workflow route: see the conversation that produced this
  plan — chiefly *local testability* of the novel logic.)
- **Language = TypeScript / Node** — matches the Actions ecosystem and `npx`
  distribution; independent of an instance's own pipeline language (the
  framework wraps any pipeline via hooks).
- **Agent layer = GitHub Agentic Workflows (`gh-aw`)** — agent behaviors are
  markdown workflows compiled to Actions via `gh aw compile`; the agent runs
  read-only and writes only through sanitized `safe-outputs`
  (`push-to-pull-request-branch` onto the engine's data-PR). Chosen over
  `anthropics/claude-code-action` (which insists on creating its own branch/PR,
  colliding with the engine-owned `data/<descriptor>` branch + label) and over
  hand-wiring the base action. Consequence: **the App identity is now required
  for interpretation to trigger at all** (see step 8).

## Architecture

- **One package** (`@norabble/continuous-research`, name TBD) that is BOTH:
  - the **config CLI** (`init`, scaffolding), and
  - the **runtime engine** — subcommands the workflows invoke (`sense`,
    `propose`, `record-decline`, …).
- **Thin generated workflows** in the instance repo call those subcommands;
  **gh-aw agentic workflows** (markdown, compiled with `gh aw compile`) run the
  agent steps. (A reusable-workflow / composite-action front door is a
  deferrable ergonomic layer — *not* Phase 1.)
- **Instance conventions** under `.research/`: `config` (tier, identity,
  toggles, hook declarations); `provenance/<descriptor>.json`;
  `decisions/<descriptor>.md`.
- **GitHub API via Octokit** inside the package (not shelling to `gh`) — for
  testability / mocking.

## Design rules — the seams that make B/C pay off

1. **Dedup is a pure function over injected state (load-bearing).** The
   three-state classifier — inputs: `descriptor` + PR list + provenance-stub
   existence → output: `{state, action}` — MUST be separated from live Octokit
   I/O behind a port (ports-and-adapters). If GitHub calls are inlined into the
   classifier, "test locally" collapses to CI-only — the exact failure B/C was
   chosen to avoid.
2. **Hooks are declared, not discovered.** The instance declares its hooks in
   `.research/config`. **Sensor and pipeline are commands the engine runs** —
   e.g. `sensor: "node sensor.js"`,
   `pipeline: "make download-data run-pipeline"`. **Interpretation is NOT an
   engine-run command** — it is a **gh-aw workflow** in the instance repo,
   triggered by the data-PR (which is why the PR must be opened under the App
   identity). The *existence* of these declarations is Phase 1; exact schema
   deferred. This declaration *is* the "framework wraps the pipeline" seam.
3. **Prototype CLI stays minimal.** First iteration: the CLI only scaffolds
   `.research/` + the workflows. Credential / identity / App setup is
   *documented manual steps*. A fully guided `init` is later work and must not
   be a prerequisite for a working loop.
4. **Phase-1 bodies are minimal; seams are real.** The interpretation hook's
   first body is a **templated stub** (open the data-PR with `new data:
   <descriptor>` + artifacts, no Claude); the prose-agent body comes *after* the
   skeleton works.

## Components (package modules)

- **descriptor** — mechanism only: read / store / tag / query by the
  `data:<descriptor>` label; check provenance-stub existence. The *scheme* is
  project-provided. (CONCEPT → *Data sensing*.)
- **dedup** — three-state classifier (merged / pending / declined) + precedence
  + the gate. Pure; behind a `GitHubPort`.
- **provenance** — write / read `.research/provenance/<descriptor>.json`
  (descriptor + source + retrieval date + content hash). The always-present
  merged-marker. (CONCEPT → *Provenance & storage*.)
- **decline** — on PR close-unmerged, deterministically template
  `.research/decisions/<descriptor>.md` from descriptor + closing comment, and
  commit to `main`. No agent. (CONCEPT → *The decline record*.)
- **proposal** — open the data-PR: branch, commit provenance stub + artifacts,
  apply the label, write the PR body (impact declaration; Phase-1 = stub). Runs
  under the **App actor** (CONCEPT → *Execution engine*, axis 1).
- **hooks** — the three contracts + their config-declared invocation.
- **config** — read `.research/config` (tier, identity, toggles, hooks). The
  toggle seam every Phase-2 feature hangs on.
- **identity / guardrails** — Claude credential (Tier 0 OAuth default) + GitHub
  actor; trigger gating (author-association), `--max-turns`, `timeout-minutes`,
  `concurrency`.

## First slice — plumbing-only walking skeleton (no Claude)

A throwaway test instance with a **deterministic** sensor, driven by
`workflow_dispatch` (not cron) for deterministic iteration. It must exercise all
**three** dedup states — including the **merged** path that validates the
Q-A/Q-E fix (merged is detected via the provenance stub on `main`, *not* the
bulk data):

| Step | Expectation | Proves |
|---|---|---|
| run 1 (`dispatch`) | proposes a `data:<desc>` PR; provenance stub on the branch | propose |
| run 2 (PR still open) | **no-op** | **pending** |
| merge the PR; run 3 | **no-op**, detected via the provenance stub on `main` — **with bulk data absent** | **merged (validates the fix)** |
| (fresh desc) propose → close-unmerged | decline record committed to `main` | decline templating |
| re-run after the decline | **no-op** | **declined** |

If the merged-path no-op works *with the bulk data not stored*, the Q-A/Q-E
contradiction fix is proven. That is the skeleton's #1 job.

## Work breakdown (sequenced)

1. **Package scaffold** — TS, test runner, CLI entrypoint, the `GitHubPort`
   interface.
2. **descriptor + dedup** — pure, unit-tested locally with injected PR-state.
   *(De-risk the novel core first; zero GitHub.)*
3. **provenance + decline** — pure templating, unit-tested.
4. **proposal** — Octokit adapter; opens PRs / commits stubs.
5. **Walking skeleton** — wire `sense` → dedup → `propose` / `record-decline` in
   the sample repo; run the three-state scenario above. _(See "Step 5 — detailed
   design" below.)_
6. **CLI scaffold** — `.research/` + workflow generation (minimal, per rule 3).
7. **Interpretation via gh-aw** _(depends on step 8's App identity — the
   dependency is inverted from the original ordering)_ — author the
   interpretation agentic workflow in markdown (trigger: the labeled data-PR;
   read-only + `push-to-pull-request-branch` safe-output; Claude engine),
   compile with `gh aw compile`, and swap the templated impact stub for the
   real agent-written impact declaration. Also: the real (network) BTC-USD
   sensor replaces the deterministic stand-in. _(Value already probed manually
   — the impact-declaration output was judged mergeable for the sample.)_
8. **App identity** — create/install a custom GitHub App
   (`create-github-app-token`); switch the engine's data-PR writes to the App
   token. Now **required before step 7**: gh-aw interpretation triggers off the
   data-PR, and `GITHUB_TOKEN`-opened PRs don't trigger downstream workflows.
   Comment-resolution (a second gh-aw workflow) rides the same identity.
9. **Guardrail hardening** — gating, max-turns, timeouts, concurrency, fork-PR
   hygiene; pin the gh-aw version.

## Step 5 — detailed design

The skeleton runs in a **dedicated sample repo** (the genuine reference
instance, `norabble/continuous-research-sample`), started with a
**deterministic** sensor so the plumbing is proven before real data or Claude.
The real crypto pipeline + agentic sensor arrive at **step 7** in the *same*
repo.

> **Status (complete):** the engine ran end-to-end *locally* against the sample
> repo — all three dedup states (new→propose, pending, merged-via-stub) plus the
> decline record committed to `main` — and then **in CI**: after the org enabled
> "Allow GitHub Actions to create and approve pull requests," a dispatched
> `sense` run opened a data-PR (sample PR #3) with the default `GITHUB_TOKEN`
> (vendored engine bundle). Remaining caveat: default-token PRs don't trigger
> downstream workflows, so the **App identity (step 8) is still required** for
> the gh-aw interpretation workflow to fire.

### Sample subject (locked)

A 24/7 crypto pair (**BTC-USD**), periodized into **editions** so the
edition/descriptor/dedup model holds. Default granularity **daily** → descriptor
`btcusd-YYYY-MM-DD` (configurable, to dial down to hourly later). One simple
updating claim (e.g. price vs its 7-day average). _Honest scope:_ the endpoint
is stable, so this sample exercises **loop + dedup + interpretation**, not
agentic sensing of a drifting source — a later sample covers that.

### Sensor ↔ engine contract (decision 1)

Hooks are declared in `.research/config` (design rule 2). The engine runs the
declared `sensor` command as a child process and reads one JSON object on
stdout — either `{ "changed": false }` or:

```json
{
  "changed": true,
  "descriptor": "btcusd-2026-06-27",
  "source": "https://api.example/btc?date=2026-06-27",
  "retrievedAt": "2026-06-27T00:00:00Z",
  "hash": "sha256:...",
  "artifacts": ["data/btcusd/2026-06-27.json"]
}
```

- `descriptor` is **opaque** to the engine (scheme stays project-defined).
- `source` / `retrievedAt` / `hash` are the provenance-stub inputs.
- `artifacts` are paths the sensor has **written into the working tree**; the
  engine reads their content and commits them on the data-PR branch (keeps large
  content out of JSON; matches how a real pipeline writes files).
- `changed:false` ⇒ the engine no-ops without touching GitHub.

### `sense` command

1. Load `.research/config`; run the `sensor` command; parse the result.
2. `changed:false` → exit.
3. Else `classify` the descriptor via `OctokitGitHubPort`:
   - `merged` / `pending` / `declined` → log + no-op.
   - `new` → build the provenance stub from the sensor fields, read the artifact
     files, and `proposeDataPR` (stub + artifacts; PR body = the Phase-1
     templated impact stub).

### `record-decline` command (decision 3)

Triggered on `pull_request: closed` (unmerged) carrying a `data:` label.

- **Reason source:** the **latest comment on the PR** (any author), with a
  default fallback when there are none. (The close event carries no "closing
  comment"; a trailing comment is the simplest faithful capture. Adds one read
  to the port: `latestComment(prNumber)`.)
- Resolve descriptor (from the label), reason, `declinedAt`, `prNumber`,
  `declinedBy` from the event payload, then `recordDecline` (commit to `main`).

### Running the (unpublished) engine in CI (decision 5 — resolved: deferred)

The workflow must invoke the engine, but it isn't published — which forces a
small prerequisite either way: **wire the CLI `bin` + a `tsc` build** so the
package runs as a command (today it is `tsx`-only dev).

**Resolved:** the distribution choice is **deferred** — it only bites when the
sample's CI is wired (end of step 5). All step-5 *engine* code is built with the
repo **private**. When we run the skeleton before going public, use **option 3**
(sample workflow checks out the framework repo with a read-only PAT and builds
it). Going **public** — which makes `npx github:norabble/continuous-research`
frictionless — happens **only on the maintainer's explicit say-so** (the concern
is profile-noise, not secrecy). Alternative if/when public is undesirable but a
cleaner consumption path is wanted: publish `0.0.x` to npm.

### Workflows (thin, generated)

- `sense.yml` — `workflow_dispatch` (schedule added later); a **`concurrency`
  group** serializes runs (the load-bearing TOCTOU guard, not just cost);
  permissions `contents` / `pull-requests` / `issues: write`.
- `decline.yml` — `on: pull_request: [closed]`, gated `if:` **not merged** AND
  has a `data:` label AND author-association ∈ {OWNER, MEMBER, COLLABORATOR}.
- Repo setting to enable: **"Allow GitHub Actions to create and approve pull
  requests."**

### Auth

The default **`GITHUB_TOKEN`** suffices for the skeleton — nothing downstream
needs triggering yet (the decline workflow fires from the _human_ close, not a
bot push). App identity stays deferred to step 8.

### The deterministic skeleton sensor

A tiny script in the sample repo that emits the detection result for a
descriptor supplied **per run** (a `workflow_dispatch` input / env), writing a
placeholder artifact — making the three-state scenario fully controllable with
no network and no Claude.

### New code this step

`.research/config` loader; a `runSensor` child-process + stdout-parse helper
(pure parser unit-tested); `sense` + `record-decline` command bodies wired into
`cli.ts`; `latestComment` on the port + adapter; CLI `bin` + `build`; the
generated workflows; and the sample repo's deterministic sensor.

## Verification (two-tier)

- **Unit (no GitHub):** dedup three-state, descriptor, provenance, decline
  templating — pure functions with injected state.
- **Integration:** the `workflow_dispatch`-driven test instance running the
  three-state scenario; assert **no duplicate PRs** and **no re-proposal**.
- **A1 empirical:** at step 8, confirm which App identity triggers downstream
  workflows.

## Non-goals (Phase 2 — seams ship, bodies don't)

Mechanical impact layer (`results.json` diff + inline claim convention + derived
index), consistency-linter, judgment agent review, `resolves_when` integration,
storage-policy advisor. (CONCEPT → *Phasing → Phase 2*.) The **sample/demo
project** is a separate repo (subject chosen: daily BTC-USD, periodized). It
starts with a deterministic sensor at step 5 and gains the real crypto pipeline
+ agentic sensor at step 7.

## Watch-items (track, don't block)

- **A1** — now settled by the gh-aw decision: a custom App identity is
  *required* for the data-PR to trigger the interpretation workflow (step 8
  precedes step 7).
- **gh-aw maturity** — preview-stage (GitHubNext); once retired releases over a
  billing-impacting bug. Pin the version; keep per-run caps
  (max-turns/timeouts) regardless — this framework's thesis is bounded cost.
- **2026 Actions secret-scoping** change — affects how workflows pass
  credentials (the agent token + App token).
- **Tier-0 ToS** assumption (CONCEPT A2) — accepted for now.
- ~~norabble org blocks Actions-created PRs~~ **Resolved:** the org setting
  "Allow GitHub Actions to create and approve pull requests" was enabled;
  CI opened a data-PR with the default `GITHUB_TOKEN` (sample PR #3). Note
  this default-token path still doesn't trigger downstream workflows — the
  App identity (step 8) remains required for interpretation.

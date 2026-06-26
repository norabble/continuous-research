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
- **Language = TypeScript / Node** — matches the Actions ecosystem, `npx`
  distribution, and `claude-code-action`; independent of an instance's own
  pipeline language (the framework wraps any pipeline via hooks).

## Architecture

- **One package** (`@norabble/continuous-research`, name TBD) that is BOTH:
  - the **config CLI** (`init`, scaffolding), and
  - the **runtime engine** — subcommands the workflows invoke (`sense`,
    `propose`, `record-decline`, …).
- **Thin generated workflows** in the instance repo call those subcommands;
  `anthropics/claude-code-action@v1` runs the agent steps. (A reusable-workflow
  / composite-action front door is a deferrable ergonomic layer — *not* Phase 1.)
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
2. **Hooks are declared, not discovered.** The instance declares its three hooks
   in `.research/config` as commands the engine runs — e.g.
   `sensor: "node sensor.js"`, `pipeline: "make download-data run-pipeline"`,
   `interpretation: "…"`. The *existence* of this declaration is Phase 1; the
   exact schema is deferred. This declaration *is* the "framework wraps the
   pipeline" seam.
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
   the test instance; run the three-state scenario above.
6. **CLI scaffold** — `.research/` + workflow generation (minimal, per rule 3).
7. **Agentic sensor + prose interpretation body** — `claude-code-action`; swap
   the templated interpretation stub for the prose-agent body.
8. **Comment-resolution** — workflow + the **empirical A1 check** (official
   `claude` app vs a custom App for downstream triggers). If A1 forces a custom
   App, that setup cost lands *here* — it must not block the skeleton.
9. **Guardrail hardening** — gating, max-turns, timeouts, concurrency, fork-PR
   hygiene.

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
storage-policy advisor. (CONCEPT → *Phasing → Phase 2*.) The **real sample/demo
project** is a separate repo, designed later with the maintainer.

## Watch-items (track, don't block)

- **A1** — official vs custom App; resolved empirically at step 8.
- **2026 Actions secret-scoping** change — affects how workflows pass
  credentials (the Claude token + App token).
- **Tier-0 ToS** assumption (CONCEPT A2) — accepted for now.

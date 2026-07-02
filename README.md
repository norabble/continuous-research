# Continuous Research

A substrate for treating research as a **living, version-controlled, mergeable
artifact** — autonomous agents propose updates as new data, literature, and
reviewer comments arrive, and a managing author accepts them through a
Git-native review workflow.

This is a **framework**; individual research efforts are _instances_ built on
it. Design source of truth: [`CONCEPT.md`](./CONCEPT.md). Build plan and current
status: [`docs/phase-1-plan.md`](./docs/phase-1-plan.md).

## How it works — where each behavior happens

The system is split into **two layers, on purpose**:

1. **The deterministic engine** — this package's CLI (`sense`,
   `record-decline`, `init`). Pure orchestration over the GitHub API (Octokit):
   detect new data, dedup against existing PRs, open the data-PR, record
   declines. **No LLM inference happens here** — it is deterministic and
   unit-tested.
2. **The agent / inference layer** —
   [GitHub Agentic Workflows (`gh-aw`)](https://github.com/github/gh-aw):
   markdown-authored agentic workflows, compiled to Actions, running Claude.
   The agent executes **read-only**; its writes land only through sanitized
   `safe-outputs` (e.g. pushing onto an existing data-PR branch). This is where
   **inference on the produced data** happens: the _interpretation step_ and
   _comment-resolution_.

Both run inside **GitHub Actions workflows**, which provide the triggers:

| Workflow             | Trigger             | What runs                                                 | Layer  | Status      |
| -------------------- | ------------------- | --------------------------------------------------------- | ------ | ----------- |
| `sense`              | schedule / dispatch | sensor → dedup → (if new) pipeline + open the data-PR     | engine | **built**   |
| `decline`            | PR closed-unmerged  | commit the decline record to `main`                       | engine | **built**   |
| `interpretation`     | a new data-PR       | read the new data + claims → write the impact declaration | agent  | **built**   |
| _comment-resolution_ | a reviewer comment  | attempt to address the comment on the PR                  | agent  | _planned_   |

The first three run end-to-end in
[the sample instance](https://github.com/norabble/continuous-research-sample)
— on 2026-07-02 a scheduled cycle sensed a real edition, opened the data-PR
under the App identity, and the gh-aw interpretation agent wrote the impact
declaration onto the PR branch via safe-outputs. Comment-resolution is the one
remaining planned behavior.

### How is inference on the produced data invoked?

**The engine never calls an LLM.** Inference on the produced data is the
**interpretation step**, performed by the agent layer: a **gh-aw workflow**,
triggered by the engine's data-PR, runs Claude read-only over the
newly-produced artifacts plus the existing prose/claims and writes the
**impact declaration** (what is strengthened / weakened / overturned) onto the
data-PR branch via the `push-to-pull-request-branch` safe-output. The engine's
only job is to get the new data into a PR _deterministically_; deciding what it
_means_ is the agent's job. (One consequence: the engine must open data-PRs
under a GitHub App identity — default-token PRs don't trigger downstream
workflows.)

> **Status (Phase 1, closing).** The full loop — sense → dedup → App-authored
> data-PR → gh-aw interpretation → impact declaration on the PR — **runs in CI
> in the sample instance** (first complete cycle 2026-07-02, on free-tier
> inference, fail-closed). Remaining to finish Phase 1: distribution (how
> instances install the engine), comment-resolution, and hardening — see the
> [plan](./docs/phase-1-plan.md) § "Finishing Phase 1".

## Instance layout

An instance declares its project hooks — **sensor**, **pipeline**,
**interpretation** — in `.research/config.json`, and gets the workflows via
`continuous-research init`. Produced artifacts, the always-committed
**provenance stubs** (`.research/provenance/`), and **decline records**
(`.research/decisions/`) live in the instance repo. See
[`norabble/continuous-research-sample`](https://github.com/norabble/continuous-research-sample)
for the worked reference instance (daily BTC-USD editions, live loop).

## Status

Early — Phase 1, building in the open. The deterministic loop (sense → dedup →
propose → decline) works and is validated; the agentic interpretation,
comment-resolution, and unattended CI are in progress. See the
[plan](./docs/phase-1-plan.md) for the step-by-step state.

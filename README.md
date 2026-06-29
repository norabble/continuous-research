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
2. **The agent / inference layer** — `anthropics/claude-code-action` running
   Claude. This is where **inference on the produced data** happens: the
   _interpretation step_ and _comment-resolution_.

Both run inside **GitHub Actions workflows**, which provide the triggers:

| Workflow              | Trigger              | What runs                                                       | Layer  |
| --------------------- | -------------------- | --------------------------------------------------------------- | ------ |
| `sense`               | schedule / dispatch  | sensor → dedup → (if new) pipeline + open the data-PR           | engine |
| _interpretation_      | a new data-PR        | **read the new data + claims → write the impact declaration**   | agent  |
| `decline`             | PR closed-unmerged   | commit the decline record to `main`                             | engine |
| _comment-resolution_  | a reviewer comment   | attempt to address the comment on the PR                        | agent  |

### Your question: how is inference on the produced data invoked?

**The engine never calls an LLM.** Inference on the produced data is the
**interpretation step**, performed by the agent layer: a `claude-code-action`
step runs Claude over the newly-produced artifacts plus the existing
prose/claims and writes the **impact declaration** (what is strengthened /
weakened / overturned) into the data-PR. The engine's only job is to get the new
data into a PR _deterministically_; deciding what it _means_ is the agent's job.

> **Status (Phase 1).** The deterministic engine is **built and validated
> end-to-end** against real GitHub. The agentic interpretation is **not wired
> yet**: today a data-PR carries a _templated_ impact stub, and the
> `claude-code-action` step that performs the real inference is upcoming work
> (it pairs with the bot identity / CI, plan steps 7–8). So no LLM inference
> currently runs in CI — it has only been exercised manually.

## Instance layout

An instance declares its project hooks — **sensor**, **pipeline**,
**interpretation** — in `.research/config.json`, and gets the workflows via
`continuous-research init`. Produced artifacts, the always-committed
**provenance stubs** (`.research/provenance/`), and **decline records**
(`.research/decisions/`) live in the instance repo. See
[`norabble/continuous-research-sample`](https://github.com/norabble/continuous-research-sample)
for a worked (skeleton-stage) instance.

## Status

Early — Phase 1, building in the open. The deterministic loop (sense → dedup →
propose → decline) works and is validated; the agentic interpretation,
comment-resolution, and unattended CI are in progress. See the
[plan](./docs/phase-1-plan.md) for the step-by-step state.

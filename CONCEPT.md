# Continuous Research Paper — Concept

> **Status:** Working draft. This document is itself meant to evolve like the
> thing it describes — settled decisions move up, open questions get resolved
> and recorded, and the reasoning behind changes is preserved.
> **Last updated:** 2026-06-25

## One-line framing

A **substrate for treating research as a living, version-controlled,
mergeable artifact** — where autonomous agents continuously propose updates as
new data, literature, and reviewer comments arrive, and a managing author
accepts them through a Git-like review workflow.

We are not building *a* paper. We are building the framework; individual
research efforts are **instances** built on top of it.

---

## Decisions settled

### What it is
- A **live, evolving body of research**, not a single static paper artifact.
- Represented natively as a **GitHub project**: markdown files, images, and
  data artifacts in a repository.
- May eventually **publish a live site** from that repo to enable richer
  interactivity. (Long-term — see Phasing.)

### What gets versioned
- A project capable of **executing a data pipeline** to produce **data
  artifacts**, plus a set of **markdown files that interpret that data**.
- The interpretation files are **primarily prose**.
- Structured elements (e.g. a claims-and-evidence graph) are an **optional
  hybrid layer** layered onto the prose where useful — *not* the spine.

### The unit of change
- At its core, a proposed update is a **GitHub Pull Request**.
- Agents act as **contributors**: they author PRs.
- The **managing author holds merge authority** — accepting a PR is how a
  finding becomes "official."
- Unmerged proposals live on **branches**: visible to contributors, but
  without the official stamp.
- A higher-level, **comprehensive (semantic) diff** — focused on *what the
  change means* rather than line-by-line edits — is a feature built **above**
  the raw PR layer, not a replacement for it.

### Impact declaration (provenance of change)
- The system declares the **practical impact** of a proposed change:
  - what the **old claims** were,
  - what appears to have been **invalidated or revised** by the new data,
    comments, or research,
  - and why.

### Contradictions & the evolution narrative
- Contradictions raised by new evidence are surfaced **inside the PR**;
  **accepting the PR is the act of accepting them.**
- Above the PR level, the project maintains a **narrative of evolution** — a
  legible history that explains *why* a change happened, *what its origins
  were*, and how the research's understanding has shifted over time.
- This evolution narrative is a **first-class concept**, distinct from (and a
  level above) the raw Git/PR commit history.

### Roles
- **Managing author** — merge authority; the "official" voice.
- **Contributors** — humans and agents who propose changes via PRs.
- **Reviewers** — comment on PRs; agents attempt to resolve their comments
  through updates.

### Execution engine (Q-A — plumbing settled; sensing + 2 items still open)

"Continuous" is **not one loop** — it is a set of *(trigger → agent behavior
→ output)* mappings, each a small independently-triggered workflow sharing a
common agent toolkit. Settled plumbing:

- **Runtime: GitHub Actions.** Default assumption is **public repos**
  (unlimited free Actions minutes). Private repos are supported for limited
  periods on the understanding they stay within the free monthly minute budget
  (or the instance is funded by an organization). Self-hosted runners remain a
  free option for either visibility.
- **Agent engine: `anthropics/claude-code-action@v1`** running inside Actions.
- **Triggers (untrusted triggers disabled by default):**
  - Scheduled **cron heartbeat** — poll sources / search literature → open PRs.
  - Maintainer-only **`workflow_dispatch`** — on-demand runs.
  - **Comment triggers gated by author-association** (OWNER / MEMBER /
    COLLABORATOR). Anonymous `@claude` mentions must not be able to spend quota.

**Two independent identity / cost axes — kept separate on purpose:**

1. **GitHub actor** (`github_token`) — *who opens PRs/commits.* Hard
   requirement: agent pushes must run under a **GitHub App identity, not the
   default `GITHUB_TOKEN`** — GITHUB_TOKEN pushes do **not** trigger downstream
   workflows (anti-recursion), which would silently break the
   comment-resolution leg. The official `claude` app appears to satisfy this; a
   custom App via `create-github-app-token` is the guaranteed, controllable
   path (and what Anthropic's own advanced examples use). Either way it is "an
   App," so this does not change the architecture — *which* app suffices is a
   build-time empirical check.
2. **Claude credential** — *who pays for inference.* Four options, chosen per
   instance (this is the cost tier; see below). `ANTHROPIC_API_KEY` takes
   precedence over the OAuth token if both are set — guard against this footgun.

### Cost tiers (default = Tier 0)

- **Tier 0 — Free / subscription-capped (default):** public repo (or
  self-hosted runner) + **`CLAUDE_CODE_OAUTH_TOKEN`** from the researcher's own
  Pro/Max subscription. Rate limits act as a hard ceiling, so runaway *dollar*
  cost is structurally impossible. **Assumption (accepted):** consumer Pro/Max
  terms permit this headless/scheduled use *for now* — we are not planning for
  all contingencies. Real practical caveat that remains: automation shares the
  same quota the researcher uses interactively.
- **Tier 1 — Serious researcher (metered API):** `ANTHROPIC_API_KEY` **with an
  account spending limit set** + higher cadence / parallelism / larger models.
- **Tier 2 — Funded / org:** Workload Identity Federation service account, or
  Bedrock / Vertex — organization-funded, centralized, auditable.

**Defense-in-depth against runaway cost (accidental & malicious):** credential
as ceiling (sub rate-limit, or API spending limit) · trigger gating by
author-association · per-run `--max-turns` + `timeout-minutes` · `concurrency`
caps + sane cron frequency · fork-PR secret hygiene.

### Framework shape (was Q-C — resolved)

The framework is **composed of three parts**, not a single deliverable:

1. **GitHub Actions workflows** — the execution substrate. *Do as much as
   possible here alone.*
2. **A GitHub App** — added only where Actions alone can't suffice. The known
   driver is the comment-resolution leg (axis 1 above): agent pushes must run
   under an *App* identity to trigger downstream workflows. Prefer the official
   `claude` app; a custom App (`create-github-app-token`) is the
   guaranteed/controllable fallback.
3. **A guided-configuration CLI** — wires the above together: selects the cost
   tier, installs/connects the App, sets secrets and guardrails, and generates
   the workflows for an instance. This is configuration *automation*, not a
   copyable template. (CLI implementation specifics deferred.)

---

## Data sensing — the continuous core (PROPOSED, not yet settled)

This is the genuinely novel half of "continuous": how a stateless scheduled
run detects "new data." Grounded in a real candidate instance,
[`norabble/ai-labor-exposure`](https://github.com/norabble/ai-labor-exposure)
(BLS OEWS data drops ~yearly around May, but the file location/naming drifts —
e.g. `special-requests` vs `special.requests`, `all` vs `nat` — so finding it
is agent-level reasoning, not deterministic code).

### The framework *wraps* an existing pipeline — it does not own it
`ai-labor-exposure` already has idempotent targets
(`make download-data → run-pipeline → classify`). So the division of labor:

- **The project provides three hooks:**
  1. **Sensor** — detect that new data exists *and locate it*.
  2. **Pipeline entry point** — process it (often already exists, e.g. the
     `make` targets).
  3. **Interpretation step** — turn new artifacts into prose / claim updates
     and an impact declaration. *(This hook is what Q-B specifies — see below.)*
- **The framework provides:** scheduling, watermark/state plumbing, the
  PR-proposal mechanism, guardrails, and identity (the Execution engine above).

### The sensor is pluggable across a spectrum
- **Deterministic** — code: HEAD a pattern-guessed URL, compare a
  hash / version / ETag / Last-Modified. Cheap.
- **Agentic** — Claude navigates the source (e.g. the BLS site), reads the
  release announcement, and locates the moved file when structure drifts.
- **Two-stage composition (protects Tier-0 quota):** a cheap deterministic
  trip-wire first; escalate to the agent only when warranted.
  - *Honest framing:* because the location pattern is unreliable, a
    pattern-guessed check will often 404 even when new data exists. The cheap
    check's real job is **confirming "nothing new" cheaply for ~11 months/year**
    — not avoiding the agent when data actually drops. Cadence should match the
    data's real rhythm (don't run an expensive agent daily for yearly data).

### Open issue blocking "settled": sensing needs THREE states, not two
The tempting model — "the watermark lives in the PR, so accept/reject governs
observed-data state" — is only two-state (on-main vs. in-PR). The system has
three, and the missing one makes it loop:

| State | Meaning | Risk if the sensor can't see it |
|---|---|---|
| **observed-and-merged** | new data accepted into `main` | fine |
| **proposed-pending** | PR open, not yet merged | re-detect → **duplicate PR** every heartbeat |
| **seen-and-declined** | author closed the PR ("not yet / looks wrong") | re-detect → **re-proposes forever** |

**Requirement:** before proposing, the sensor must **dedup against open *and*
closed PRs / branches** (or a persisted declined-marker). A pure
watermark-on-merge cannot distinguish pending or declined from genuinely new.
This is the missing piece — not a redesign, but the reason sensing stays
*proposed*.

*(Deferred to build time: the sensor-contract schema — detection-result
fields, watermark file format.)*

---

## Phasing

### Short term — do as much as possible *inside the GitHub project*
- Repository as the substrate (markdown + images + data artifacts + pipeline).
- The PR-based propose/review/merge workflow.
- Agent-authored PRs driven by new data (monitoring is the minimum viable
  trigger).
- Impact declarations and the evolution narrative as repo-native artifacts.

### Long term — interactivity beyond the repo
- Publish a **live site** generated from the GitHub project.
- Richer interactive elements that a static repo can't express.
- Plan should *support both*, but build the GitHub-native layer first and
  resist gold-plating toward the site prematurely.

---

## Open questions (to resolve next)

### Q-A (residual). The data-sensing mechanism — the genuinely novel half
A **proposed design now exists** (see "Data sensing" above): framework-wraps-
pipeline, a pluggable deterministic↔agentic sensor, two-stage trip-wire. It is
**not settled** because of one concrete gap: the sensor must represent **three
states** (merged / pending / declined) and dedup against open & closed PRs, or
it will duplicate-propose or re-propose forever. Resolve that → sensing closes.

The two earlier assumptions are now closed:
- **A1 — resolved:** agent pushes must run under a **GitHub App identity** (not
  the default token) for the comment-resolution leg to fire. Official `claude`
  app likely suffices; custom App is the guaranteed fallback. Remaining work is
  a build-time empirical check of *which*, not an architectural unknown.
- **A2 — accepted:** Pro/Max terms permit headless use for now; assumption
  accepted, not planning for all contingencies.

### Q-B. Author-written vs. mechanical impact detection — and when structure must land
Impact declaration (above) is the *payoff* of linking claims to evidence:
- **Author-written impact summaries** → stays prose-first; the hybrid
  structured layer can stay long-term.
- **Mechanical impact detection** ("this data change affects these 3 claims")
  → forces the structured hybrid layer in **earlier** than "long-term."

Which mode do we want short-term? The answer sets the timeline for the
structured layer. **Note:** Q-B is not independent — it *is* the spec of the
**interpretation-step hook** surfaced by the Data-sensing design above. Resolve
them together.

### Q-C. Framework shape — *resolved* (guided-configuration CLI; see above)

### Q-D. Reviewers: human-only, or also agents?
Are reviewers strictly human, or do agents also perform (e.g. adversarial /
red-team) review?

### Q-E. Data provenance & reproducibility
Are data artifacts committed to the repo, regenerated on demand, or both?
How is the lineage of a data artifact tracked?

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

1. **GitHub actor** (`github_token`) — *who opens PRs/commits.* Default for
   mentions is the official `claude` GitHub App. ⚠️ **Verify:** the
   comment-resolution leg requires that agent-authored PRs/commits *trigger
   downstream workflows*; pushes made with the default `GITHUB_TOKEN` do **not**
   (anti-recursion). This likely forces a **custom GitHub App**
   (`actions/create-github-app-token`) even at Tier 0 — confirm before relying
   on auto-resolution.
2. **Claude credential** — *who pays for inference.* Four options, chosen per
   instance (this is the cost tier; see below). `ANTHROPIC_API_KEY` takes
   precedence over the OAuth token if both are set — guard against this footgun.

### Cost tiers (default = Tier 0)

- **Tier 0 — Free / subscription-capped (default):** public repo (or
  self-hosted runner) + **`CLAUDE_CODE_OAUTH_TOKEN`** from the researcher's own
  Pro/Max subscription. Rate limits act as a hard ceiling, so runaway *dollar*
  cost is structurally impossible. ⚠️ **Top open risk:** whether consumer
  Pro/Max terms permit sustained scheduled/headless use as a framework's
  default operating mode, and the fact that automation shares the same quota
  the researcher uses interactively.
- **Tier 1 — Serious researcher (metered API):** `ANTHROPIC_API_KEY` **with an
  account spending limit set** + higher cadence / parallelism / larger models.
- **Tier 2 — Funded / org:** Workload Identity Federation service account, or
  Bedrock / Vertex — organization-funded, centralized, auditable.

**Defense-in-depth against runaway cost (accidental & malicious):** credential
as ceiling (sub rate-limit, or API spending limit) · trigger gating by
author-association · per-run `--max-turns` + `timeout-minutes` · `concurrency`
caps + sane cron frequency · fork-PR secret hygiene.

### Framework shape (was Q-C — resolved)

The framework is delivered as a **guided-configuration CLI**, *not* a copyable
template. The CLI walks a researcher through tier selection, identity/secret
setup, guardrails, and workflow generation for their instance. (CLI
implementation specifics are deliberately deferred.)

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
The execution *plumbing* is settled above (runtime, triggers, credential
tiers). What is **not** settled is how a stateless scheduled run actually
**detects "new data."** Floated but unconfirmed: commit a small watermark
(last-seen hash/timestamp) into the repo so a run diffs the source against it.
This is the novel half of "continuous" and still needs a real design.

Plus two **assumptions to verify** (see Execution engine above):
- **A1:** Does the comment-resolution leg require a *custom* GitHub App at
  Tier 0 (because default-token pushes don't trigger downstream workflows)?
- **A2:** Do consumer Pro/Max terms permit sustained scheduled/headless use as
  the framework's *default* operating mode?

### Q-B. Author-written vs. mechanical impact detection — and when structure must land
Impact declaration (above) is the *payoff* of linking claims to evidence:
- **Author-written impact summaries** → stays prose-first; the hybrid
  structured layer can stay long-term.
- **Mechanical impact detection** ("this data change affects these 3 claims")
  → forces the structured hybrid layer in **earlier** than "long-term."

Which mode do we want short-term? The answer sets the timeline for the
structured layer.

### Q-C. Framework shape — *resolved* (guided-configuration CLI; see above)

### Q-D. Reviewers: human-only, or also agents?
Are reviewers strictly human, or do agents also perform (e.g. adversarial /
red-team) review?

### Q-E. Data provenance & reproducibility
Are data artifacts committed to the repo, regenerated on demand, or both?
How is the lineage of a data artifact tracked?

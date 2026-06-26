# Continuous Research Paper — Concept

> **Status:** Working draft. This document is itself meant to evolve like the
> thing it describes — settled decisions move up, open questions get resolved
> and recorded, and the reasoning behind changes is preserved.
> **Last updated:** 2026-06-26

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

### Review (Q-D — settled)
- **Human review is the spine.** Managing author holds merge authority; human
  reviewers comment; agents resolve comments. Any agent involvement in review is
  **additive — it never gates a merge.**
- **Deterministic consistency-linting** of the Q-B convention (every `backs:`
  key exists in `results.json`; a claim whose backing result changed had its
  `status` touched; no orphaned claim ids) is cheap and **default-on whenever
  the impact layer is enabled** (off when it is). It is **advisory / author-
  overridable, not a hard merge gate**, to stay consistent with merge authority.
- **Judgment agent review** (critique of claim support, etc.) is **opt-in, off
  by default** (it spends Tier-0 quota). Its non-redundant value is on
  **author-driven** changes — agents already scrutinize agent-authored data-PRs
  at proposal and act in comment-resolution; reviewing agent-authored work is an
  explicit opt-in scope, not the default.

### Execution engine (Q-A — settled)

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

## Data sensing — the continuous core (SETTLED)

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
- **The framework provides:** scheduling, **descriptor state plumbing**
  (read / store / tag / query by descriptor), the PR-proposal mechanism,
  guardrails, and identity (the Execution engine above).

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

### Three-state dedup, keyed off the data-PR's own state (race-free)
A naive "watermark lives in the PR" model is only two-state and loops: two
heartbeats before any decision both open a PR (**duplicate**), and a closed PR
gets re-detected (**re-proposes forever**). The fix: every proposal carries a
**descriptor** label (e.g. `data:oews-2026`), and the three states are read
directly off the **data-PR's own state** with cheap, deterministic `gh pr list`
queries — so the signal exists the instant the author acts, with **no race**:

| State | Signal (keyed by descriptor) |
|---|---|
| **merged** | data on `main` (e.g. `data/processed/oews-2026/…` exists) or the data-PR is merged |
| **pending** | an **open** PR labeled `data:oews-2026` |
| **declined** | a **closed-unmerged** PR labeled `data:oews-2026` (`--state closed`, `mergedAt == null`) |

The dedup gate runs **before** spending the agent: pending or merged → do
nothing; declined → don't auto-propose — hand the recorded reason to agent
judgment, which re-proposes only if the reason's invalidating condition is now
met (e.g. a BLS revision); neither → genuinely new → proceed. **Precedence**
when a descriptor spans states (re-proposal after a decline):
merged/on-main > open > closed-declined.

### Descriptor key — framework provides the *mechanism*, project provides the *scheme*
- **Framework (mechanism):** read / store / tag / query by descriptor — the
  label conventions and the dedup gate. It must reliably apply the descriptor
  label at PR creation (the "storing" half this all depends on).
- **Project (scheme):** *what string* identifies a unit of data (`oews-2026`,
  `onet-29.0`, …), implemented by the project's sensor — agent or
  agent-generated code — because "what counts as one unit of data" is
  domain-specific. Derive it from data *identity*, not *location* (locations
  drift; editions don't). Allow a revision component (`oews-2026r1` / hash),
  since a revision is exactly what justifies revisiting a decline.

### The decline record — for the narrative, not the loop
When the author closes a data-PR unmerged, an **authorized workflow commits a
decline record straight to `main`** (e.g. `.research/decisions/oews-2026.md`)
capturing the descriptor + the author's closing comment. It needs **no PR of its
own** — it is a factual log of an action the author already took, not a research
claim, so it doesn't warrant a review gate. It is generated by **deterministic
templating, not an agent call** (a rejection must never spend Tier-0 quota), and
it is *not* the dedup signal — the closed data-PR already is — so nothing depends
on its timing. This ledger feeds the evolution narrative.

### Honest scope of the quota protection
Where the next descriptor is **predictable** (periodic editions: last merged
`oews-2025` → expected `oews-2026`), the dedup gate runs *before* agent
escalation and genuinely avoids spending the agent. Where the descriptor is
**not** predictable (irregular discoveries), dedup still prevents duplicate PRs
but not duplicate agent runs — there, **cadence** is the cost lever.

*(Deferred to build time: detection-result fields, exact label/path
conventions, any optional observation-note format.)*

---

## Interpretation & impact (Q-B — SETTLED)

How the interpretation-step hook turns new artifacts into an **impact
declaration** (old claims → strengthened / weakened / overturned). Impact has
two layers with very different costs:

1. **Data/results delta — mechanical.** Pipelines emit a machine-comparable
   **`results.json`** (or the agent writes one when absent); the framework
   **diffs** it across editions. Free, deterministic, needs no claims graph.
2. **Claim impact — judgment.** The agent narrates what a delta *means* for the
   prose, fed the cheap diff rather than the raw artifacts.

### The convention: structure holds only the *linkage*, never the claim
Prose stays canonical. The claim↔result link rides **inline in the prose** as an
invisible annotation — single source of truth, grep-able, accretive:

```
<!-- claim: sector-redistribution-signal | backs: dynamic_sector_corr_economywide | status: supported -->
```

End-to-end: diff `results.json` → for each changed key, `grep` the prose for
`backs:.*<key>` → the agent re-examines exactly those passages and writes the
impact declaration into the data-PR (updating numbers / `status` as part of the
PR). Contradictions (a result that *overturns* a claim) surface here, where
accepting the PR accepts them — tying impact to the governance model.

**Graceful degradation:** unannotated claims are simply reasoned over in prose.
**The "claims graph" is *derived*** — the agent extracts a thin
`claim_id → result_keys` index from the inline annotations (just as it writes
`results.json` when absent); it is a cache, never a source of truth, and a
project can delete it losing nothing.

**Optional extensions** (one line each, not core): `controls: <key>` (a result
that must stay weak or the claim is threatened); `confirmed_through: <edition>`;
and the standout **`resolves_when: <edition>`** — an *open* claim names the
edition that would answer it, so the **sensing loop knows an incoming edition
resolves a waiting question** (bidirectional, via the same descriptor namespace).

### Disableability — a first-class principle
This is a complex layer of uncertain reliability in any given project, so it
**must be disableable per project** via an explicit project-level toggle. When
off, the framework runs no results-diffing or claim-impact machinery and impact
is whatever the agent/author writes in plain prose. Disabling the impact layer
must **not** disable the core sensing → PR loop — they are independent. Lean:
the mechanical claim layer is **opt-in (conservative default)**, and a project
that adopts it can turn it off at any time.

> *Generalizes:* any complex/automated component should be independently
> disableable, with the system degrading gracefully toward manual / prose-first.

*(Deferred to build time: `results.json` schema, the config/toggle file, the
exact annotation grammar.)*

---

## Phasing

**Principle:** essentially every *optional* feature that doesn't require a hook
in the core is built in a **later phase**.

**Corollary (the trap to avoid):** deferring a feature's *body* is fine;
deferring its *attachment seam* turns "Phase 2" into "rewrite Phase 1." The real
test: *if deferred, can this attach later without modifying core?* If not, its
**seam is Phase 1** even when its **body is Phase 2.** So **Phase 1 = the core
loop + every extension seam a planned optional feature will hang off, shipped
with minimal default bodies.**

### Phase 1 — core (inside the GitHub project)
- The data-sensing → PR loop: scheduling, descriptor dedup (three-state),
  decline records, PR-based propose/review/merge with **human review as
  authority**.
- Identity / cost-tier config + guardrails (trigger gating).
- The guided-configuration CLI to set the above up.
- **Extension seams shipped now (with minimal default bodies):**
  - **Interpretation hook contract** (in: new artifacts + PR; out: impact
    declaration into the PR) — Phase-1 body is **prose-only** impact.
  - **Config / toggle mechanism** — every disableable Phase-2 feature hangs here.
  - **PR-event trigger + author-vs-agent actor distinction** — both the linter
    and judgment-review attach here, and "target author-driven work" depends on
    this distinction existing now.
  - **Descriptor namespace** — `resolves_when` hangs off it; keep the Phase-1
    sensor contract extensible enough for a project to consult claim state later.

### Phase 2 — optional bodies on Phase-1 seams (all disableable)
- The **mechanical impact layer** (Q-B): `results.json` diff + inline claim
  convention + derived index — swaps into the interpretation seam.
- **Consistency-linter** (default-on with the impact layer).
- **Judgment agent review** (opt-in, off by default; author-driven scope).
- **`resolves_when`** sensing integration.

### Long term — interactivity beyond the repo
- Publish a **live site** from the GitHub project; richer interactivity a static
  repo can't express. Support both, but build the GitHub-native layer first and
  resist gold-plating toward the site prematurely.

---

## Open questions (to resolve next)

### Q-A. The data-sensing mechanism — *resolved* (see "Data sensing" above)
Settled: framework-wraps-pipeline; pluggable deterministic↔agentic sensor;
three-state dedup keyed off the **data-PR's own state** (race-free); descriptor
*mechanism* in the framework, *scheme* in the project; decline record
auto-committed to `main` (deterministic templating) for the narrative, not for
the loop.

The two earlier assumptions are also closed:
- **A1 — resolved:** agent pushes must run under a **GitHub App identity** (not
  the default token) for the comment-resolution leg to fire. Official `claude`
  app likely suffices; custom App is the guaranteed fallback. Remaining work is
  a build-time empirical check of *which*, not an architectural unknown.
- **A2 — accepted:** Pro/Max terms permit headless use for now; assumption
  accepted, not planning for all contingencies.

### Q-B. Interpretation & impact — *resolved* (see "Interpretation & impact" above)
Settled: two-layer impact (mechanical `results.json` diff + agent-narrated claim
impact); the claim↔result link rides **inline in the prose** (structure = linkage
only, never re-states the claim); the claims graph is a *derived* index, not a
source of truth; structure never forced (accretes, graceful degradation); and
the whole layer is **disableable per project**, independent of the sensing loop.
`resolves_when` ties an open claim back to the sensing loop.

### Q-C. Framework shape — *resolved* (guided-configuration CLI; see above)

### Q-D. Review — *resolved* (see "Review" above)
Human review is the spine (never agent-gated). A cheap **deterministic
consistency-linter** is default-on with the impact layer (advisory, not a hard
gate). **Judgment agent review** is opt-in, off by default, targeted at
author-driven work. Both are Phase-2 bodies on Phase-1 seams.

### Q-E. Data provenance & reproducibility
Are data artifacts committed to the repo, regenerated on demand, or both?
How is the lineage of a data artifact tracked?

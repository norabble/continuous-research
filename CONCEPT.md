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

### Q-A. The execution engine — what actually makes it "continuous"? *(top priority)*
The data model and governance are specified; the **cadence/trigger/runtime**
is not. Specifically:
- **What watches for new data**, and on what schedule or signal?
- **What runtime runs the agents?** (Candidate: GitHub Actions — native fit.)
- **What identity opens agent-authored PRs?** (Candidate: a bot/app identity.)

"Continuous" lives or dies here.

### Q-B. Author-written vs. mechanical impact detection — and when structure must land
Impact declaration (above) is the *payoff* of linking claims to evidence:
- **Author-written impact summaries** → stays prose-first; the hybrid
  structured layer can stay long-term.
- **Mechanical impact detection** ("this data change affects these 3 claims")
  → forces the structured hybrid layer in **earlier** than "long-term."

Which mode do we want short-term? The answer sets the timeline for the
structured layer.

### Q-C. Framework shape
How is "the framework" delivered to an instance? (e.g. template repo,
GitHub App, reusable Actions/workflows + conventions, a CLI — or a mix.)

### Q-D. Reviewers: human-only, or also agents?
Are reviewers strictly human, or do agents also perform (e.g. adversarial /
red-team) review?

### Q-E. Data provenance & reproducibility
Are data artifacts committed to the repo, regenerated on demand, or both?
How is the lineage of a data artifact tracked?

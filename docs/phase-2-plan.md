# Continuous Research — Phase 2 Build Plan

> Derived from [`CONCEPT.md`](../CONCEPT.md) → _Phasing → Phase 2_. Like
> [`phase-1-plan.md`](./phase-1-plan.md), this is a work-breakdown and a set of
> **seam rules** — it points at the concept, it does not re-derive it. Phase 1
> is **complete**; Phase 2 fills in the **optional bodies on the seams Phase 1
> shipped**, all disableable.
>
> **Status:** Draft for review. **Last updated:** 2026-07-05

## Glossary

The abstract vocabulary this plan leans on, defined once. Canonical terms carry
a `(C)` and are owned by [`CONCEPT.md` → _Canonical terms_](../CONCEPT.md); the
rest are Phase-2 handles. Definitions are handles, not second copies — don't
restate a mechanism, point to it.

- **Framework / Instance** `(C)` — the substrate / one research project on it.
- **Descriptor** `(C)` — the scheme-assigned identity of one unit of data
  (`btcusd-2026-07-01`); from data _identity_, not location.
- **Edition** `(C)` — the descriptor of the data a given `results.json`
  reflects; same identity, different surface.
- **data-PR** `(C)` — a PR the sensing loop opens proposing new data/findings.
- **`results.json`** `(C)` — the committed, machine-comparable results artifact;
  the **diffable unit**. In the sample it _is_ the edition artifact
  (`data/btcusd/<descriptor>.json`, keys `close`, `ma7`, …).
- **Impact declaration** `(C)` — one change's statement of what is
  **strengthened / weakened / overturned**, written into the data-PR.
- **findings** — the instance's living prose (`findings.md`): the canonical
  claims, each followed by an annotation.
- **Claim** — one assertion in the findings prose, addressed by a stable
  **claim id** (`btc-short-term-trend`).
- **Annotation** — the invisible inline marker after a claim linking it to its
  backing results and standing:
  `claim: <id> | backs: <keys> | status: <status>` (an HTML comment in the
  file). Structure holds only the _linkage_, never the claim.
- **`backs:` key** — a dotted path into `results.json` naming a result that
  supports a claim (`close`, `google.free.gemini-3.1-flash-lite.rpd`). A
  `(prose)` marker means "no mechanical backing" — reasoned in prose only.
- **`status`** — `supported | weakened | overturned | open` — the claim's
  current standing.
- **Mechanical impact layer** — the deterministic half of interpretation
  (Q-B): a **results diff** + a **derived claim index** that hand the agent a
  cheap, exact "which claims to re-examine." Opt-in, conservative default off.
- **results diff** — deterministic comparison of a new edition's `results.json`
  against the **prior merged edition's**; yields the set of changed keys. Free.
- **Derived claim index** — a cache mapping `claim_id → { backs, status }`,
  parsed from the annotations. Deletable, never a source of truth.
- **Consistency-linter** — deterministic, advisory checks over the
  annotation↔results relationship. Comments; **never a merge gate**.
- **Judgment agent review** — opt-in agent critique of claim support, scoped to
  **author-driven** changes.
- **`resolves_when: <descriptor>`** — an annotation on an _open_ claim naming
  the edition that would answer it, so the sensing loop can flag resolution.
- **Storage-policy advisor** — an agent skill recommending, per artifact,
  {commit / skip+stub / store} for a cost-vs-risk dial. Advisory.
- **Seam** — a Phase-1 attachment point a Phase-2 body hangs off **without
  modifying core** (the phasing rule: defer bodies, never seams).
- **Agent body** — the agent-authored half of a feature (prose, judgment), as
  opposed to its deterministic engine half.
- **Agent engine** — the substrate an agent body runs on: **gh-aw**
  (markdown → Actions) or **`claude-code-action`** (subscription-friendly). The
  framework supports **both** (see seam rule 2).
- **Disableability** — every Phase-2 feature toggles off via config, degrading
  to prose-first / manual, without breaking the core loop.

## Where Phase 1 left the seams

- **Config / toggle mechanism — not actually built.** `src/config.ts` parses
  only `{ "sensor": … }`. CONCEPT lists the toggle mechanism as a Phase-1 seam
  ("every disableable Phase-2 feature hangs here"); it does not exist yet, so
  **F0 below builds it first** — nothing is "disableable" without it.
- **Annotation convention — already in de-facto use, informally.** Both
  instances' `findings.md` carry
  `<!-- claim: … | backs: … | status: … -->`. The sample uses real result keys
  (`backs: close, ma7, close_vs_ma7_pct, ma7_trend`); token-source-review mixes
  dotted paths (`google.free.gemini-3.1-flash-lite.rpd`) and prose notes
  (`(framework telemetry)`). Phase 2 **formalizes the grammar** to cover all
  three; it is not inventing it.
- **Interpretation body — prose-only.** The scaffolded gh-aw interpretation
  workflow writes an impact declaration from the raw artifact. Phase 2 **swaps
  the mechanical layer into that seam**; prose-only remains the fallback when
  the layer is off.

## Seam rules (load-bearing for Phase 2)

1. **Deterministic cores stay pure engine TS.** results diff, derived index,
   linter checks, the annotation parser, config parsing — all pure functions
   over injected facts, no I/O, unit-tested without GitHub (design rule 1,
   ports-and-adapters). This is the bulk of F0–F2.
2. **Agent bodies are engine-agnostic — gh-aw _or_ `claude-code-action`.** The
   framework produces the deterministic inputs (the diff, the affected-claims
   set) and defines a **substrate-neutral agent contract**; the body may run on
   gh-aw's `push-to-pull-request-branch` safe-output **or** on
   `claude-code-action` (needed by Claude Pro/Max subscription users — gh-aw
   rejects `CLAUDE_CODE_OAUTH_TOKEN`, proven in the sample's sensor-repair
   qualification). `init` scaffolds one flavor per an instance choice; the
   engine half is identical either way. (Extends the engine-agnostic principle
   already recorded for the framework.)
3. **Everything is disableable via config (F0); disabling never breaks the core
   loop.** Mechanical layer off ⇒ the interpretation flow skips the `impact`
   step and the agent does prose-only — exactly the Phase-1 body.
4. **The derived index is a cache.** Deletable, rebuilt from annotations; a
   project that removes it loses nothing.

## Decomposition & sequencing

```
F0 config/toggle  ──►  F1 mechanical impact layer (KEYSTONE)  ──►  F2 linter
                                    │
                                    └─ grammar ──►  F3 resolves_when
F4 judgment review   (needs only F0)
F5 storage advisor   (independent)
```

**Keystone = F0 + F1 + F2** — carries the design risk and unblocks F2 + F3, so
it gets an execution-ready plan (`writing-plans`, next). **F3 / F4 / F5** stay
roadmap bullets here: they depend on contracts the keystone settles
empirically, so TDD-detailing them now would churn.

---

## Keystone (F0 + F1 + F2) — execution-ready design

### F0 — config / toggle foundation

**Files:** `src/config.ts` (+ test); `src/scaffold.ts` (config template).

Extend `ResearchConfig` with an **optional** `impact` block, staying
backward-compatible (existing `{ "sensor": … }` still parses; absence ⇒ layer
off — the conservative default):

```json
{
  "sensor": "node sensor.mjs",
  "impact": {
    "enabled": true,
    "resultsPath": "data/btcusd/${descriptor}.json",
    "findings": "findings.md",
    "linter": true,
    "agentEngine": "gh-aw"
  }
}
```

- `enabled` (default `false`) — the master toggle for F1+F2.
- `resultsPath` — where the edition's `results.json` lives; `${descriptor}` is
  substituted. Defaults to the sensor's declared artifact when omitted.
- `findings` (default `findings.md`) — the prose file the index is parsed from.
- `linter` (default `true` when `enabled`) — F2 on/off.
- `agentEngine` (`gh-aw` | `claude-code`) — which substrate the scaffolded
  agent body targets (seam rule 2). Deterministic engine is unaffected.

Pure parse + validation, unit-tested; unknown keys ignored (forward-compat).

### F1 — mechanical impact layer (approach B: the `impact` subcommand)

**New engine command** `impact <descriptor>`, invoked by the interpretation
flow **only when `impact.enabled`**. Pure cores behind the thin CLI shell:

- **`src/results.ts` — `diffResults(prev, next) → ChangedKey[]`** (pure).
  Flattens both `results.json` to dotted leaf paths and returns
  `{ key, from, to }` for each changed/added/removed leaf. Worked example
  (sample): prev `close: 61000` → next `close: 64245.72` ⇒
  `{ key: "close", from: 61000, to: 64245.72 }`.
- **`src/annotations.ts` — `parseAnnotations(findingsMd) → ClaimIndex`**
  (pure). Grammar, formalized to cover both instances:
  `claim: <id> | backs: <key>[, <key>…] | status: <status>`, where each `<key>`
  is a dotted path into `results.json` or the literal `(prose)`. Returns
  `claim_id → { backs: string[], status, line }`. Tolerant: unannotated claims
  and malformed lines are reported, not fatal (graceful degradation).
- **`src/impact.ts` — `affectedClaims(changed, index) → Claim[]`** (pure). For
  each changed key, the claims whose `backs` includes it (prefix-aware for
  dotted paths). Worked example: `close` changed → claim `btc-short-term-trend`
  (its `backs` = `close, ma7, close_vs_ma7_pct, ma7_trend`).
- **CLI shell** reads prev results from the **prior merged edition** (via the
  provenance stub / `main`; reuse the `GitHubPort`), next results from the PR
  working tree, computes the diff + affected set, and writes
  `.research/impact/<descriptor>.impact.json` onto the PR branch:
  `{ edition, changed: ChangedKey[], affected: [{ claim_id, backs, status }] }`.

**Agent body (substrate-neutral contract).** Reads `<descriptor>.impact.json`
+ `findings.md`; for each affected claim re-examines exactly that passage,
writes/updates `.research/impact/<descriptor>.md` (the impact declaration) and
the claim's `status`/values in `findings.md`. Confined to those two paths.
Wired as **either** the existing gh-aw workflow (add the `impact` step before
the agent step; keep `allowed-files` + `protected-files: allowed`) **or** a
`claude-code-action` workflow (`--allowedTools` scoped to the two files, App
token for the PR). `agentEngine` picks which `init` scaffolds.

### F2 — consistency-linter

**Files:** `src/linter.ts` (pure, + test); a thin invocation in the
interpretation flow (advisory comment).

Deterministic checks over `(results.json, ClaimIndex)` (CONCEPT Q-D):

- every non-`(prose)` `backs:` key **exists** in `results.json`;
- a claim whose backing key **changed** this edition had its `status`
  **touched** (else "stale status" warning);
- **no orphaned** claim ids (annotation with no prose) and no duplicate ids.

Output: a findings list. **Advisory only** — posted as a PR comment / step
summary, **never a merge gate** (merge authority stays human). Default-on when
`impact.enabled`; silent when the layer is off.

---

## Roadmap — F3, F4, F5 (bodies deferred; seams noted)

### F3 — `resolves_when` sensing integration

- **Grammar:** extend the annotation with an optional
  `resolves_when: <descriptor>` on an `open` claim.
- **Seam:** the `sense` flow gains a read of claim state (the derived index) so
  that when an incoming edition's descriptor matches a pending `resolves_when`,
  the loop **flags the waiting question resolved** (comment / label on the
  data-PR). Bidirectional via the shared descriptor namespace (CONCEPT 431).
- **Depends on:** F1's grammar + index. Deterministic; small agent body (or
  none — a templated note suffices).

### F4 — judgment agent review

- **Body:** an opt-in agent workflow (gh-aw **or** `claude-code-action`, per
  seam rule 2) that critiques claim support on **author-driven** PRs — the
  non-redundant scope (agents already scrutinize agent-authored data-PRs).
- **Seam:** the Phase-1 author-vs-agent actor distinction + F0 toggle
  (`off` by default; spends quota). No engine core work beyond the toggle.

### F5 — storage-policy advisor

- **Body:** a standalone framework **agent skill** that reads an instance's
  pipeline and recommends per-artifact {commit / skip+stub / store} for a
  cost-vs-risk dial, plus the `.gitignore` + provenance-stub conventions
  (CONCEPT Q-E). Advisory, never enforced; independent of F1–F4.
- **Seam:** none in core — it reads config + repo and emits advice.

---

## Validation

- **Unit (no GitHub):** `diffResults`, `parseAnnotations`, `affectedClaims`,
  linter checks, config parse — pure functions with injected editions and
  annotation fixtures.
- **Live, sample primary:** `continuous-research-sample` — clean numeric keys
  give real strengthened/weakened/overturned deltas; its annotation already
  uses real `backs` keys. Run a data-PR through the enabled layer end to end.
- **Live, token-source-review as stress test:** exercises dotted structured
  paths and `(prose)` backs, and the messy-grammar cases, **before the grammar
  is frozen** — harden `parseAnnotations` / `affectedClaims` against it.

## Build-time decisions to settle (in the keystone plan)

- Exact `results.json` **flatten rule** for nested/structured keys (arrays?
  object leaves only?) — driven by the tsr stress case.
- The **prior-edition read**: cleanest source for the previous merged
  `results.json` (provenance stub reference vs. reading the file off `main`).
- The **`.impact.json` schema** (the diff artifact the agent consumes).
- How `init` presents the **`agentEngine` choice** and scaffolds the matching
  agent-body template (two flavors of the interpretation workflow).

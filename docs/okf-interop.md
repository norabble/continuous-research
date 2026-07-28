# OKF interop

How a Continuous Research instance projects its record into the [Open Knowledge
Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf)
(OKF) **v0.2**. The governing principles are in [`CONCEPT.md`](../CONCEPT.md) →
*Interop*; this page is the mechanism — the field-by-field mapping and the
decisions that fix it.

**Status.** The concept is settled and the export **ships** in full:
`okf-export` renders `index.md`, `log.md`, `findings/`, `editions/`, and
`computations/` from the instance's committed record ([CLI
reference](./cli.md#okf-export)). Every trust family v0.2 defines is now
carried:

| Family | State |
| --- | --- |
| `sources`, `generated` | shipped — carried by the provenance stub (`@v2`) and projected into the bundle |
| per-claim attribution | shipped — the annotation's optional `editions:` field, preferred over the legacy prose scan |
| `verified` | shipped — written onto the stub at merge by `record-verification`, never derived at export |
| `stale_after` | shipped — from `okf.staleAfterDays`, on editions only; absent when unset |
| `Attested Computation` | shipped — `computations/sensor.md` + its attester |

The sections below are the specification the implementation follows.

## Why OKF

OKF v0.2 is markdown-with-YAML-frontmatter plus a small agreed vocabulary. Its
v0.2 release added a **trust-signal family** — `sources`, `generated`,
`verified`, `status`, `stale_after` — which is the part that matters here, for
three reasons:

1. **It names a field CR already owed itself.** CONCEPT.md → *Provenance &
   storage* has always required that stored non-deterministic outputs record
   *how the judgment was made* (model / version + prompt). Nothing implemented
   it. OKF's `generated: {by, at}` is that field, with an actor grammar already
   agreed by someone else.
2. **CR earns OKF's strongest trust signal honestly.** OKF derives
   *human-reviewed* from a `verified` entry whose actor is `human:<id>`. Bundles
   generated at machine scale will mostly be *machine-confirmed*. Every accepted
   CR edition passed a human data-PR merge — the loop has always produced
   human-reviewed knowledge and has had no portable way to say so.
3. **It is distribution CR does not have to build.** A conformant bundle is
   readable by the OKF visualizer, Google Cloud Knowledge Catalog, and any
   OKF-aware agent.

## What the export is

A **derived bundle**, on the same footing as the generated site: rebuilt from
the instance's own artifacts, never edited by hand, never read back as truth.
The instance's canonical record is unchanged — `.research/provenance/*.json`,
`.research/decisions/*.md`, and `findings.md` remain authoritative.

Off by default (`okf.enabled`). An instance that never turns it on is
unaffected in every observable way.

```
_okf/
├─ index.md                    okf_version: "0.2"; sections linking concepts
├─ log.md                      edition / decline stream, newest-first
├─ findings/<claim-id>.md      type: Finding    — one per claim annotation
├─ editions/<descriptor>.md    type: Edition    — one per merged provenance stub
├─ computations/sensor.md      type: Attested Computation — the sensor contract
└─ computations/attester.md    type: Reference  — the deterministic check
```

## Field mapping

| OKF v0.2 | Continuous Research | Notes |
| --- | --- | --- |
| `sources[]` — `resource`, `id`, `title`, `last_modified` | provenance stub — `source`, `descriptor`, `retrievedAt` | `source` is one flat string today; it becomes `sources[0].resource` |
| *(no OKF equivalent)* | stub `hash` (`sha256:…`) | rides as a **custom key**; OKF preserves unknown keys — see *Divergences* |
| `generated: {by, at}` | the sensor's declared producer | captured at sense time; closes the Q-E gap |
| `verified: [{by, at}]` | the human data-PR merge | the **verification record**; written onto the stub at merge, not derived at export |
| `status` — `draft` / `stable` / `deprecated` | **name collision only** — claim `status` is `supported` / `weakened` / `overturned` / `open` | different axes; see *Decision 2* |
| `stale_after` | `okf.staleAfterDays` + the edition's `retrievedAt` | an absolute `YYYY-MM-DD`; editions only, absent when unset |
| `[^source-id]` footnotes | the inline claim annotation's `editions` | per-claim attribution; `backs` is separate — see *Decisions 6 and 7* |
| `log.md` — newest-first `## YYYY-MM-DD` | the edition / decline stream | the evolution narrative, in a portable shape |
| `index.md` + `okf_version` | *nothing* | bundle root only |
| `type: Attested Computation` | the sensor contract | `runtime: shell`; `executor.receipt` **is** the detection result's key set; the attester is the descriptor-keyed dedup |

### Actor grammar

OKF requires one of three actor forms. CR's assignment:

| Actor | Form | Example |
| --- | --- | --- |
| Sensor | `process:<id>` | `process:trip-wire` |
| Interpretation agent | `<producer>/<version>` | `gh-aw/gemini-3.1-flash-lite` |
| Human | `human:<id>` | `human:rbaker5` |

`human:` is the prefix OKF consumers key the *human-reviewed* tier off. It is
emitted **only** from a real merge event, never from configuration — and a
merge performed by a bot yields `process:<slug>` instead, because an auto-merge
is a machine confirmation and no person attended it.

## Decisions

1. **Vocabulary containment.** OKF's terms (*concept*, *bundle*, *trust tier*)
   appear only in this layer's docs and code. CR's canonical terms are never
   renamed, and no OKF term is added to *Canonical terms*.

2. **The `status` collision is not reconciled.** OKF `status` is a **lifecycle**
   axis; CR's claim `status` is an **epistemic** one. A weakened claim is still
   a current claim. Both are emitted, on separate keys:

   | CR claim status | `claim_status` (custom key) | OKF `status` |
   | --- | --- | --- |
   | `supported` | `supported` | `stable` |
   | `weakened` | `weakened` | `stable` |
   | `overturned` | `overturned` | `deprecated` |
   | `open` | `open` | `draft` |

   Collapsing them would lose the distinction that makes CR's findings worth
   reading — that a claim can be *weakened but still standing*.

3. **Declines are not concepts.** A declined edition never merged, so no
   `Edition` concept is emitted for it. It appears as a `**Declined**` entry in
   `log.md`, carrying its recorded reason. The bundle is the record of what was
   *accepted*; the log is the record of what happened.

4. **Trust honesty.** `verified` is emitted only for editions with a real
   recorded merge. Absence is meaningful in OKF, so a missing `verified` is a
   true statement, while a synthesized one is a lie that survives export into
   systems that trust it.

   The corollary is *where* it is written: the merge event is the only place
   the fact exists, so `record-verification` appends it to the edition's
   provenance stub at merge. Deriving it at export time would make the bundle's
   trust tier depend on whether the exporter happened to hold a token — worse
   than no tier at all — and would cost `okf-export` its offline property. It
   also fails loudly when the stub is missing rather than skipping quietly.

8. **The freshness window is declared, not inferred.** `stale_after` comes from
   `okf.staleAfterDays`, a maintainer's statement about the data's shelf life.
   It is emitted on **editions only**: an edition has a real retrieval date to
   anchor the window, while a finding has no timestamp of its own and inherits
   its freshness from the editions it cites. Unset means the key is absent
   everywhere — "no declared window" and "fresh forever" are different claims,
   and OKF reads a missing key as the former.

5. **Permissive `resource`.** OKF requires `sources[].resource`; CR's `source`
   is a free, unvalidated locator (not always a URL). The export passes it
   through unchanged rather than failing closed — an unusual locator is not a
   reason to refuse to describe an edition.

6. **`backs` is not a source list.** The inline annotation's `backs` names
   whatever the claim rests on — `results.json` keys (`close, ma7`), dotted
   source keys, or literally `(prose)`. It is emitted verbatim as a custom
   `backs` key. `sources[]` comes from the annotation's separate `editions:`
   field.

7. **Attribution is recorded, not inferred.** `editions:` is written by the
   step that knew the answer — the interpretation agent, which takes its
   descriptor from the PR's `data:` label and may record *only* that one. The
   linter rejects an entry naming no accepted edition. Where the field is
   absent the export falls back to scanning the prose for backticked
   descriptors, which is how claims annotated before the field are attributed;
   there is no third fallback, and a claim with neither signal gets no
   `sources` key at all.

## Divergences from OKF

Stated rather than papered over, per *Adopt the vocabulary, not the model*.

- **No integrity field.** OKF's `sources[]` carries *credibility* signals
  (author, usage count, last modified) but nothing for **integrity**. CR's
  content hash is the mechanism that makes "don't store, re-fetch later" safe,
  so it rides as a custom key. This is a plausible upstream contribution: the
  distinction between *who vouches for this* and *is this the same bytes* is one
  OKF currently cannot express.
- **Sensors are unparameterized.** OKF's `Attested Computation` assumes a
  computation whose declared parameters an agent binds at call time — "the agent
  MAY only supply values for the declared parameters; it MUST NOT author or edit
  the computation." A CR sensor takes no parameters and no agent touches it at
  all. CR is the **degenerate, stricter case**, and the mapping says so instead
  of inventing parameters to fill the slot: `parameters: []` is emitted
  explicitly, since an omitted list would read as "not stated" rather than
  "there are none".

- **The attester is a description, not a script.** OKF's `attester.resource`
  "names code (no LLM) that takes a receipt and returns a verdict". CR's check
  is not a standalone file — it is the engine's own descriptor-keyed dedup
  against the committed record, and there is nothing for an instance to vendor.
  So `attester.resource` points at `computations/attester.md`, a prose account
  of exactly what the check does. It satisfies "no LLM" and it is honest about
  where the code lives; it is not an executable artifact, and this states that
  rather than implying one.

  That document is its own file rather than a section of `sensor.md` for a
  mechanical reason: OKF permits exactly **one** fenced code block in an
  Attested Computation body (it is the computation), so instance-authored prose
  containing a fence would break conformance silently.
- **Verification is per-edition, not per-document.** OKF `verified` attests a
  concept. CR's human merge attests **one edition** of the data behind it.
  Findings inherit their trust signal from the editions they cite, which is
  weaker than a direct attestation and is documented as such.

## Non-goals

- **Ingest.** This is an export. A frontmatter parser exists for round-trip and
  conformance tests, not for reading third-party bundles.
- **Splitting `findings.md` on disk.** The prose stays one living document that
  the interpretation step revises; the per-claim split exists only inside the
  derived bundle.
- **Changing the descriptor scheme, the provenance path, or the dedup marker.**
  The provenance stub's path is the durable "merged" marker the sensing loop
  reads; interop does not get to move it.

## Conformance

OKF ships no validator (the reference repo provides `enrich` and `visualize`
only), so the framework checks its own output. A bundle is conformant when:

- every non-reserved `.md` file has parseable frontmatter with a non-empty
  `type`;
- reserved filenames are limited to `index.md` and `log.md`;
- `log.md` date headings match `## YYYY-MM-DD`, newest first;
- `okf_version` appears only in the bundle-root `index.md`;
- every `stale_after` is an absolute `YYYY-MM-DD`;
- every cross-link — including `attester.resource` — resolves to a file that is
  actually in the bundle;
- the Attested Computation body carries exactly one fenced block.

The independent check is the reference implementation itself: pointing OKF's
`visualize` at a generated bundle proves a third-party consumer reads it.

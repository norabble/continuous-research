# Backlog

Deferred items, none scheduled. Each entry says why it matters and what
"done" is — enough to pick it up cold. (Security items come from the
2026-07-06 review of the release → distribution → execution process.)

## Live site / interpretation

- **Blockquote rendering + entity-regression test (bundled)** — site-md's
  `escapeHtml` escapes `>`, so findings blockquotes render as literal
  "&gt;" text. Safe fix per the 2026-07-07 whole-branch review: drop `>`
  from **site-md's source pre-escape only** (`<` still blocks all raw
  HTML; `&` still defuses entity-obfuscated schemes) — never touch
  site-render's `escapeText` (attribute sinks). Done = the change + a
  regression test pinning `[x](javascript&colon;alert(1))` inert + the
  blockquote test updated. Also note in-code: JS multiline `$` matches
  before `\r`, so CRLF annotation-stripping works — don't "fix" it.
- **Site cleanup ticket (small gaps, one pass)** — stable card sort
  (proposedAt desc) + test; hostile-provenance detail-page test; export
  ANNOTATION_LINE from site-md (dedupe with site-render); decline.yml pin
  assertion in scaffold tests; README site row mentions dispatch; optional
  `\r\n`→`\n` normalization atop renderUntrustedMarkdown; clear `_site/`
  before local writes (stale updates/*.html across local previews).

- **Mechanical `data:`-label gate on interpretation** — the interpretation
  workflow triggers on every App-authored PR, including `sensor-repair`'s fix
  PRs, whose bodies deliberately embed untrusted source-response samples; the
  `data:`-label guard today is prompt-level only (the workflow's own "stop if
  no `data:` label" instruction, not the trigger). Done = the scaffolded
  interpretation workflow (and the sample's) refuses non-`data:` PRs
  mechanically — investigate gh-aw frontmatter support for label conditions
  on the trigger (do not guess the syntax in the template now) — plus the
  sample re-qualified against it.

- **Impact declarations should lead with the revised claim** — the site's
  pending-update excerpt shows the impact markdown from the top, and the
  scaffolded interpretation template writes *prior claim first*, so the
  most useful line (the revised claim) is buried below the fold of any
  excerpt (2026-07-06 prototype review). Done = the interpretation
  workflow template's "Write" section orders the declaration revised-claim
  → assessment → what-changed → prior-claim (or the renderer learns to
  surface the revised-claim section first), and the sample's next edition
  demonstrates it.

## OKF interop

The concept is settled (CONCEPT.md → *Interop*, Q-F) and the mapping is
specified in [`okf-interop.md`](./okf-interop.md). The export mechanism
(`okf-export`) and per-claim attribution both ship; these are what is left, in
the order they were staged. Each is independently useful — none blocks another.

- **Backfill `editions:` on the six existing claims** — the annotation's
  optional `editions:` field ships (parser, linter rule, export, prompts), but
  it only fills in going forward: the agent appends the edition it was
  triggered by, so a claim gets attributed the next time an edition revises
  it. The six claims already written across both instances carry nothing, and
  token-source-review's prose names no descriptor, so it stays at **0 of 5**
  attributed until they are filled in by hand. **Sequencing is binding:** an
  engine older than the field's release parses a 4-field annotation with the
  extra field absorbed into `status`, so both instances must be pinned to a
  release carrying the fix *before* any prose gains the field. Done =
  `btc-short-term-trend` → `btcusd-2026-06-27, btcusd-2026-07-01`;
  `engine-model-token-limits` and `google-free-flash-lite-sessions` →
  `limits-google-d1992c4c`; `copilot-free-incompatible` →
  `limits-github-74e042c7`; `session-budget` and
  `consumer-subscriptions-incompatible` judged by the maintainer and left
  empty if no edition established them (an absent citation is a true
  statement; a supplied one would not be).

- **Verification record + freshness (`verified`, `stale_after`)** — human merge
  is already the review spine (Q-D) and is exactly what OKF means by
  *verified*, so instances have been producing human-reviewed knowledge with no
  portable way to say so. `provenance@v2` accepts and validates `verified`, but
  **nothing writes it**: it needs the merge event. Record it durably at merge
  rather than deriving it at export time — a bundle whose trust tier depends on
  whether the exporter happened to hold a token is worse than one with no tier
  at all, and deriving it would also cost `okf-export` its no-token, offline
  property. Note the symmetry: the decline record captures rejection, this
  captures acceptance; the loop has only ever recorded half.
  Done = `recordVerification` in `src/flows.ts` mirroring `recordDecline`
  (commit to the default branch, `verify(<descriptor>): record merge`), a
  `record-verification` command, a scaffolded `merged.yml` symmetric with
  `decline.yml`, and a **new port read for merge metadata** — do *not* widen
  `PullRequest` in `src/types.ts`, which is deliberately `{number, state,
  labels}` to keep the dedup classifier pure. `stale_after` rides along from a
  config-set staleness window, omitted entirely when unset.

- **Sensor as an `Attested Computation`** — the sensor contract already has the
  shape OKF's attestation model describes: a declared `runtime`, an `executor`,
  a `receipt` (the detection result), and a deterministic attester (the content
  hash that already guards against silent source drift). Mostly emission plus a
  written attester description; little new logic. State the divergence rather
  than papering over it (already noted in `okf-interop.md`): OKF assumes a
  parameterized computation whose parameters an agent binds, and CR sensors take
  no parameters and no agent touches them — CR is the degenerate, stricter case.
  Done = `computations/sensor.md` emitted into the bundle from `config.sensor`
  plus the detection-result contract, and an attester description committed
  under `.research/`.

## Security hardening (release/distribution)

- **Tag ruleset on `v*`** — tags are the trust anchor for `npx github:…#vX`
  and are mutable today; a moved tag executes on every instance's next cron
  with that instance's App token. Done = repo ruleset blocking tag update +
  deletion on `v*`.
- **Reframe the vendored bundle as the hardened path** — `npx github:`
  installs devDependencies and runs lifecycle scripts with the App token in
  env; the committed bundle runs zero install at runtime. Done = cli.md /
  adopting.md present it as a security posture, not a fallback.
- **Publish prebuilt to npm** — consumers would install only `octokit` (no
  devDeps, no `prepare`), and npm versions are immutable. Largely obsoletes
  the two items above. Done = `npm publish` in the release flow + scaffold
  pins the npm package.
- **Signed tags** (minor) — closes the edited-release-notes /
  moved-tag social-engineering channel completely.
- **Ruleset intent check** (minor) — `protect-main` carries a
  `pull_request` rule the maintainer bypasses; decide whether that's the
  intended bootstrapping posture or should start binding.

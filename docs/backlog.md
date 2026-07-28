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

## Decline & review path

Found on 2026-07-27 while clearing a 23-edition backlog in
`continuous-research-sample`. All three share a failure mode: the decline
record is the loop's memory of what was *rejected*, and every one of these
loses it **silently** — the workflow reports success and the record is simply
wrong or absent.

- **Scaffolded `decline.yml` cannot fire for a conflicting data-PR** — it
  triggers on `pull_request`, and such a run needs `refs/pull/N/merge`, which
  GitHub cannot compute for a PR that conflicts with the base branch. Instances
  whose data-PRs all revise the same prose (the normal case) have every sibling
  conflict the moment one edition merges, so from then on closing a data-PR
  records **nothing at all** — the workflow does not fail, it never runs. The
  tell is that every `decline` run in the repo belongs to a *merged* PR. Fixed
  in the sample (its PR #43) by switching to `pull_request_target`, which
  resolves in base context and needs no merge ref; safe for the same reason
  `site.yml` already documents — `actions/checkout` takes no `ref:`, so no PR
  code is checked out or executed, and the engine is pinned by commit and only
  reads the event payload. Done = the same switch in `src/scaffold.ts`'s
  `DECLINE_WORKFLOW` plus a scaffold test asserting the trigger, and
  `token-source-review` re-pointed to match.

- **The decline reason depends on a repo association the App token may not
  see** — `latestTrustedComment` accepts only `OWNER`, `MEMBER` or
  `COLLABORATOR`, but `author_association` is computed **per viewer**. Where
  the maintainer's org membership is private, every other viewer — including
  the App installation token the workflow runs as — sees `CONTRIBUTOR`, so the
  closing comment is ignored and the record silently reads *"Closed without
  merge; no reason provided."* Verified both ways on 2026-07-27: private
  membership fell back on 7 of 7 declines; adding the maintainer as a direct
  repo collaborator made the App token report `COLLABORATOR` and the reasons
  landed. The engine is not wrong, but it is quietly hostage to an org setting
  nobody would think to check. Done = either the port falls back to the closing
  event's `sender` when no trusted comment is found (the closer's identity is
  in the payload and needs no association lookup), **or** the CLI logs a
  visible warning when it uses the default reason — at minimum the silence has
  to go. Note for whoever picks this up: re-recording works, so records already
  written this way are repairable by reopening and re-closing the PR.

- **A multi-paragraph decline reason breaks `log.md` rendering** — the OKF
  exporter emits each log entry as a single `- **Declined** … — <reason>` list
  item, so a reason containing a blank line splits the item and the remainder
  renders as body text outside the list. Visible now in the sample's published
  bundle. Done = either the exporter collapses the reason to its first
  paragraph (with the full text staying in the decline record, which is the
  canonical copy), or it indents continuation lines to keep them inside the
  list item. Prefer the former — a log is an index, not the record itself.

## OKF interop

**Done.** Every v0.2 trust family now ships — `sources` / `generated` /
per-claim attribution, then `verified` + `stale_after` and the sensor as an
`Attested Computation`. The mapping and its divergences are in
[`okf-interop.md`](./okf-interop.md); nothing is outstanding here. What is left
is *adoption*, which is instance work rather than framework work: both
instances need the pin bump that brings them `merged.yml`, and every edition
merged before it existed carries no `verified`. Those can be backfilled — the
merges are real and their actor and timestamp are still readable from the PR
history — but only from that record. Nothing may be filled in by assumption.

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

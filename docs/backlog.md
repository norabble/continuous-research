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
- **Go-public checklist additions (from the final review)** — before
  flipping the sample public and enabling the site workflow: verify the
  `github-pages` environment's deployment-branch protection accepts
  deploys triggered from data-PR head branches (else every data-PR event
  runs red), and check fork-PR behavior (secrets/OIDC unavailable).

- **Impact declarations should lead with the revised claim** — the site's
  pending-update excerpt shows the impact markdown from the top, and the
  scaffolded interpretation template writes *prior claim first*, so the
  most useful line (the revised claim) is buried below the fold of any
  excerpt (2026-07-06 prototype review). Done = the interpretation
  workflow template's "Write" section orders the declaration revised-claim
  → assessment → what-changed → prior-claim (or the renderer learns to
  surface the revised-claim section first), and the sample's next edition
  demonstrates it.
- **Sample repo public flip** — security review of the sample's contents +
  workflows first, then flip public, enable Pages, re-enable the `site`
  workflow, and qualify the live event path (site rebuilds on data-PR
  events). Blocked deliberately until the live-site task set is complete.

## Security hardening (release/distribution)

- **Tag ruleset on `v*`** — tags are the trust anchor for `npx github:…#vX`
  and are mutable today; a moved tag executes on every instance's next cron
  with that instance's App token. Done = repo ruleset blocking tag update +
  deletion on `v*`.
- **Document SHA pinning as hardened mode** — `#<full-sha>` instead of
  `#vX.Y.Z` removes tag trust entirely. Done = adopting.md upgrade section
  offers it with the trade-off stated.
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

# Backlog

Deferred items, none scheduled. Each entry says why it matters and what
"done" is — enough to pick it up cold. (Security items come from the
2026-07-06 review of the release → distribution → execution process.)

**One exception, if you are picking this up cold:** *OKF interop* below is not
deferred. The work is done and merged, and a numbered chain there is blocked on
cutting a release — until that happens, none of it runs on any instance. Start
there.

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
  no `data:` label" instruction, not the trigger). Measured cost on the sample
  2026-07-28: a **3m19s agent run** to conclude "not a data-PR", on every
  infrastructure PR.

  The investigation the earlier version of this entry asked for is **done**, and
  the answer has a trap in it. gh-aw does support a top-level `if:`, identically
  in v0.81.6 and v0.83.4 — no upgrade needed. Its `on.pull_request.names` filter
  is *not* usable here: exact label names, capped at 25, and our label carries an
  unbounded descriptor. But the obvious `if:` on labels **would break the loop**:
  `proposeDataPR` labels the PR *after* opening it (`src/flows.ts`; on the
  sample's PR #40, created `04:11:54`, labeled `04:11:55`), so
  `github.event.pull_request.labels` is empty in the `opened` payload and the
  gate is false for every data-PR. A correct gate needs `labeled` in the trigger
  types, and then wants `github.event.action != 'labeled' ||
  startsWith(github.event.label.name, 'data:')` so a later unrelated label does
  not re-interpret the PR. Done = that, in the scaffold and the sample, with a
  data-PR observed still triggering.

- **`site.yml`'s label gate never matches on `opened`** — the same
  attach-after-open timing, already shipped. The scaffolded site workflow
  triggers on `[opened, synchronize, reopened, closed]` and gates on a `data:`
  label, so its `opened` runs have always skipped. Masked because `synchronize`
  (the interpretation agent's push) and `closed` both fire later with the label
  present, so the site still rebuilds and nobody noticed. Cosmetic today, but it
  is the same bug as above and should be fixed with it rather than rediscovered.

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
  tell is that every `decline` run in the repo belongs to a *merged* PR.

  A **conflict is not the only way in.** Observed on `token-source-review`
  2026-07-29: closing and reopening a clean, mergeable PR ~5s after pushing to it
  produced **no `pull_request` runs at all** — not `decline` on the close, not
  interpretation on the reopen — while `pull_request_target` (`site`) fired three
  times. GitHub had not yet computed `refs/pull/N/merge` for the new head. So the
  same silence arrives from a *timing race* whenever an automation closes a PR
  soon after pushing, with nothing anywhere reporting a skip. Waiting for the
  merge ref to appear is the workaround; `pull_request_target` removes the class.

  Fixed in the sample (its PR #43) by switching to `pull_request_target`, which
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

## Agent layer (gh-aw)

Found 2026-07-29 upgrading both instances from gh-aw v0.81.6 to v0.83.4.

- **Comment resolution reports changes it never made** — the first
  `/resolve` run ever to *execute* on the sample (every earlier one was
  `skipped`) finished green and posted a comment stating it had rewritten a
  phrase in `findings.md`. It had not: no commit, prose unchanged, and its own
  sentence carried an empty filename slot. It called `add_comment` and never
  called `push_to_pull_request_branch`. Two things keep it silent — nothing ties
  the agent's claim to an actual diff, and gh-aw's `if_no_changes: "warn"` means
  even a called-but-empty push would not fail. This is the trust-honesty rule
  turned on the loop's own output: a signal emitted where no event backs it, and
  a reviewer has no way to tell. The template is scaffolded, so every adopter has
  it. Done = the workflow fails, or says plainly that it changed nothing, when a
  run that claims an edit produced no commit; plus the sample re-qualified.

- **The agent CLI version is inherited, stale, and not independently
  settable** — gh-aw pins `@google/gemini-cli` **0.39.1** (published
  2026-04-24) in `constants.DefaultGeminiVersion`, unchanged across v0.81.6,
  v0.83.4 and `main`, while its sibling constants move (Claude Code 2.1.220,
  Copilot 1.0.75, Codex 0.146.0). Instances inherit it silently.

  It has a measurable cost. On `token-source-review`, `gemini-3.5-flash-lite`
  reports `cached: 0` on every turn, so every turn re-sends the whole prompt;
  `gemini-3.1-flash-lite` cached 4k–12k tokens in the same repo on the same
  gh-aw version, models alternating on the same day. That is not a model
  limitation — Google documents caching as supported for both, implicit caching
  needs no client action, and *neither* appears in Google's implicit-caching
  threshold table, so the model list cannot be what separates them. The leading
  explanation is that the April client predates the July model. It also caused a
  hard failure: v0.83.4's api-proxy enforces `maxCacheMisses` (default 5) where
  v0.81.6's did not, so a zero-caching engine aborts mid-run — worked around
  there with `max-turn-cache-misses: 20`, which *tolerates* the waste.

  `engine.version` is a real compiler input (verified: the lock installs the
  version given) but **not a usable knob** — gh-aw's generated Gemini
  configuration is coupled to the CLI it pins, and 0.53.0 rejects the auth setup
  gh-aw writes (`Invalid auth method selected`, exit 41; stating the type via
  `GEMINI_DEFAULT_AUTH_TYPE` did not help). So the caching hypothesis is
  **untested, not disproven**. Done = raise the stale pin upstream, and until it
  moves, note in `adopting.md` that a model newer than gh-aw's pinned CLI may
  silently lose prompt caching — the adopter-visible symptom is a rising token
  bill with no change in workload.

## OKF interop

**Done.** Every v0.2 trust family now ships — `sources` / `generated` /
per-claim attribution, then `verified` + `stale_after` and the sensor as an
`Attested Computation`. The mapping and its divergences are in
[`okf-interop.md`](./okf-interop.md); nothing is outstanding here. What is left
is *adoption*, which is instance work rather than framework work: both
instances need the pin bump that brings them `merged.yml`, and every edition
merged before it existed carries no `verified`.

That adoption is **blocked on a release that has not been cut**, and it is a
chain — each step needs the one before it:

1. **Cut a release.** `main` is 11 commits past `v0.1.7`, so nothing in this
   section is running anywhere. The version is a judgment call rather than a
   bump: `deps` → `dependencies` is a breaking change to the type surface
   re-exported from `src/index.ts` (pre-1.0, and nothing consumes it as a
   library today — instances run the CLI — so the cost is presentational).
2. **Bump both instances' engine refs.** They differ deliberately:
   `token-source-review` pins the tag `#v0.1.7`; `continuous-research-sample`
   pins the release commit's SHA (`30c2b40`), which is the hardened path the
   *Security hardening* section below argues for. Keep that difference.
3. **Add `merged.yml` by hand to both.** `init` scaffolds it for new instances;
   existing ones get nothing automatically, and without it a merge records no
   verification.
4. **Backfill `verified`** — currently 0 of 18 editions on the sample, 0 of 5 on
   `token-source-review`. The merges are real and their actor and timestamp are
   still readable from the PR history, but **only** from that record; nothing may
   be filled in by assumption. A bot merge must attest as `process:`, not
   `human:`.

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

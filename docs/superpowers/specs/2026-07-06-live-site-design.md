# Live site v1 — design

> Approved 2026-07-06. Implements the first slice of CONCEPT.md → *Long term
> — interactivity beyond the repo*. Vocabulary per CONCEPT → *Canonical
> terms*; this document does not restate mechanisms it links.

## Purpose

A **per-instance, entirely read-only** website for **followers of the
research** — readers who understand research and review but not GitHub. One
job: answer *"what does this project currently claim, and what updates are
pending review?"* The site is the first user-facing realization of
CONCEPT's "comprehensive (semantic) diff above the raw PR layer": a data-PR
is presented as a **proposed update** whose body is its impact declaration,
never as a diff.

Decisions locked during brainstorming:

- **Scope**: per-instance; the framework ships the mechanism, each instance
  publishes its own site.
- **Content v1**: rendered `findings.md` + open data-PRs (impact-first) +
  a quieter maintenance section (open framework-authored non-data PRs).
  History/evolution is v2.
- **Freshness**: rebuilt on repo events (minutes-stale worst case).
- **Translation**: full — no PR numbers, diffs, or GitHub chrome; one
  "view on GitHub" link per update.
- **Hosting**: GitHub Pages via Actions; qualify on the public sample
  (`continuous-research-sample`). Private instances can build in CI but not
  publish (Pages needs a paid plan on private repos).
- **Architecture**: approach A — engine `site` subcommand + pure static
  renderer (chosen over client-side API fetch and third-party SSG for fit
  with the ports-and-adapters core, the existing distribution, and
  testability).

## Reader experience

**Two page types, static HTML, no client-side JavaScript.**

### Index page (top to bottom)

1. **Header** — instance title + one-line framing ("A living research
   project: findings update as new evidence arrives and passes review.")
   and a "last updated" date.
2. **Pending updates** — one card per open data-PR: edition (descriptor),
   proposed date, status "awaiting the author's review", the opening of its
   impact assessment, link to the detail page. If the impact declaration
   does not exist yet on the PR branch: evidence source + "assessment in
   progress". Empty state: "No updates pending review — findings are
   current as of \<date\>."
3. **Current findings** — `findings.md` rendered to HTML. Claim annotations
   are stripped during rendering (they are HTML comments — invisible
   anyway). *(v2 seed: render per-claim status badges from annotations.)*
4. **Maintenance** (quiet, bottom) — one line per open framework-authored
   non-data PR, framed as instrument upkeep, each with a GitHub link.

### Update detail page (one per open data-PR)

- Title: "Proposed update — edition `<descriptor>`".
- Body: the impact declaration ("What this changes": prior claim, what
  changed, assessment, revised claim) rendered from
  `.research/impact/<descriptor>.md` on the PR branch.
- **Evidence record** box: source URL, retrieval date, integrity hash —
  the provenance stub, translated.
- Status line: "Awaiting the author's review — updates become part of the
  findings only after review."
- One discreet "view the underlying proposal on GitHub" link.

### Translation table (single module owns it)

| GitHub / framework term | Site term |
| --- | --- |
| data-PR | proposed update |
| open PR | awaiting the author's review |
| impact declaration | what this changes |
| provenance stub | evidence record |
| descriptor | edition |
| merge / merge authority | the author's review / acceptance |
| framework-authored non-data PR | maintenance |

## Architecture

### Engine surface

New subcommand: `continuous-research site` (same package/distribution).

Flow: load `.research/config.json` → gather `SiteData` via `GitHubPort` →
`renderSite(siteData): SiteFile[]` (pure) → write files under `_site/`.

**Config seam** (disableability principle — absent ⇒ no site machinery;
independent of the sensing loop and the impact layer):

```json
{
  "site": {
    "enabled": true,
    "title": "BTC-USD, continuously",
    "description": "optional one-line subhead"
  }
}
```

**Environment**: `GITHUB_TOKEN`/`GH_TOKEN` + `GITHUB_REPOSITORY` (read-only
API use).

### Data gathering rules

- **Pending updates** = open PRs with a `data:<descriptor>` label. Per PR,
  read from the **PR head ref** (content lives on the branch until merge,
  via the existing `readFileFromRef`): `.research/impact/<descriptor>.md`
  (optional) and `.research/provenance/<descriptor>.json`.
- **Findings** = `findings.md` from the default branch (missing ⇒ section
  omitted).
- **Maintenance** = open PRs whose author login ends in `[bot]` and that
  carry no `data:` label.
- **Trust rule**: only PRs authored by a bot identity (`[bot]` author)
  appear on the site at all — a non-bot PR is excluded entirely, even if
  someone applies a `data:` label to it. A human-labeled hostile PR must
  not get its branch content rendered into the site, nor a listing.
- **Port addition**: `listOpenPullRequests(): { number, title, labels,
  authorLogin, createdAt, headRef, htmlUrl }[]` — one new read on
  `GitHubPort` + the Octokit adapter.

### Rendering

- Markdown → HTML via **`marked`** (zero transitive dependencies; the
  package's second runtime dependency after octokit — accepted
  deliberately).
- **Untrusted-input stance (load-bearing)**: impact declarations and
  findings are agent-written. Raw HTML passthrough is disabled; all content
  is escaped; claim-annotation comments are stripped. No inline scripts;
  styling is one static CSS file emitted with the site.
- Renderer is a pure module: `SiteData → SiteFile[]` (path + content), no
  I/O, no Date.now (the "last updated" timestamp is injected).

### Workflow (scaffolded by `init`, thin)

`site.yml`: triggers `pull_request` (opened, synchronize, reopened,
closed), `push` to the default branch filtered to `findings.md` +
`.research/**`, and `workflow_dispatch`; permissions `contents: read,
pages: write, id-token: write`; a `concurrency` group serializing deploys;
steps: checkout → node → `npx … site` → `actions/upload-pages-artifact` →
`actions/deploy-pages`. Documented manual step (design rule 3 — the CLI
scaffolds, setup steps are documented): repo Settings → Pages → source
"GitHub Actions".

### Failure behavior — fail closed, stay stale

Any gathering/render error fails the build; the previously deployed site
remains. A stale site that shows its own "last updated" date is honest; a
half-rendered one is not. Per-update degradation only for the *expected*
gap: impact file absent ⇒ "assessment in progress" card.

## Testing

- **Renderer (pure)**: fixtures for empty state, pending-assessment,
  full update, maintenance-only, and hostile markdown (script/HTML
  injection must come out escaped).
- **Command**: fake port; asserts the gathering rules (label filter,
  bot-author trust rule, head-ref vs default-branch reads, missing-file
  handling).
- **Scaffold**: template test like `sense.yml`'s (valid YAML, correct
  triggers/permissions, pinned engine version).
- **Live qualification**: enable on the sample (real open/merged/declined
  history), verify: index renders findings + a pending update end-to-end;
  a data-PR close triggers a rebuild that drops the card.

## Out of scope (v2 seeds, recorded not designed)

History/evolution page (needs the evolution-narrative mechanism), claim
status badges from annotations, RSS/notifications, custom domains, any
write path (comments, reactions), multi-instance aggregation.

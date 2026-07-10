# Adopting Continuous Research

How to install the framework in a **new or existing project** and reach a
running loop: sense → data-PR → agent interpretation → human merge. Command
and schema details live in the [CLI reference](./cli.md); the design itself in
[`CONCEPT.md`](../CONCEPT.md). The worked reference instance is
[`norabble/continuous-research-sample`](https://github.com/norabble/continuous-research-sample)
(daily BTC-USD editions, live loop).

## What you get / what you provide

**The framework provides** scheduling, descriptor dedup (no duplicate
proposals, ever), the data-PR mechanism, provenance stubs, decline records,
and guardrailed agent workflows. **Your project provides three hooks:**

1. **Sensor** — a command that detects a new data edition and says so in JSON
   ([contract](./cli.md#sensor-contract)). You also choose the **descriptor
   scheme** — what string identifies one unit of data (`oews-2026`,
   `btcusd-2026-07-01`) — derived from data *identity*, not location.
2. **Pipeline** — whatever already turns raw data into artifacts (often
   existing `make` targets). The sensor writes the artifacts the data-PR
   should carry.
3. **Interpretation** — not a command: a gh-aw agentic workflow (scaffolded
   for you) that writes the impact declaration onto each data-PR.

Merge authority stays with you. Agents only ever propose.

## Prerequisites

- A GitHub repository for the instance. **Public** is the default assumption
  (unlimited free Actions minutes); private works within your Actions minute
  budget.
- Repo/org permission to create workflows, a GitHub App, and secrets.
- Locally: `gh` (authenticated) and the gh-aw extension
  (`gh extension install github/gh-aw`). Node ≥ 22 if you want to run the
  engine locally; CI installs its own.
- An inference credential for the agent layer (see *Agent layer* below —
  a free-tier Gemini API key is the proven zero-cost path).

## Install

In the repo root (new or existing project — `init` never overwrites):

```sh
npx --yes github:norabble/continuous-research#v0.1.6 init
```

This scaffolds `.research/config.json` plus five workflows
([what each file is](./cli.md#init)). Then:

1. **Wire your sensor.** Point `"sensor"` in `.research/config.json` at your
   detection command. Start deterministic (fetch → hash → compare); you can
   move along the deterministic↔agentic spectrum later. Hash the
   *substance*, and **pin content negotiation**: send an `Accept-Language`
   header (and any locale query parameter) on every fetch — providers rotate
   served translations and A/B markup per request, which otherwise mints
   several spurious "editions" from one real content-state.
2. **Leave the cron commented out** in `sense.yml` until the first manual
   run succeeds. When you enable it, match the cadence to the data's real
   rhythm — dedup makes re-runs safe, so err frequent only if runs are cheap.

## The GitHub App (required, ~10 minutes)

Data-PRs must be opened by a **GitHub App identity**. This is load-bearing,
not bureaucracy: PRs opened with the workflow-issued `GITHUB_TOKEN` **never
trigger downstream workflows** (GitHub's anti-recursion rule, specific to
Actions-issued tokens), so interpretation would simply never run in CI. PRs
opened with a *personal* token — e.g. when driving the loop locally — do
trigger it; see *Driving the loop locally* below.

**Create one** (once per org/user; reusable across instances):

1. Settings → Developer settings → GitHub Apps → **New GitHub App**. Name it
   anything (`myorg-research-bot`); Homepage URL can be the repo. Uncheck
   *Webhook → Active*.
2. Repository permissions: **Contents — Read and write**, **Issues — Read
   and write**, **Pull requests — Read and write**. Nothing else.
3. Create, then **Generate a private key** (downloads a `.pem`).
4. **Install App** → your account/org → *Only select repositories* → the
   instance repo.
5. In the instance repo, set two Actions secrets:
   `CONTINUOUS_RESEARCH_APP_ID` (the App's numeric ID) and
   `CONTINUOUS_RESEARCH_APP_PRIVATE_KEY` (the full `.pem` contents). The
   names are deliberately prefixed: bare `APP_ID` is the de-facto default
   from `create-github-app-token` examples, so an unprefixed name can
   collide with another integration's secret in the same repo — or silently
   inherit a *different* App from an org-level secret.

**Reusing an existing App** for a new instance: Settings → GitHub Apps →
your App → Configure → add the repository (or
`gh api --method PUT /user/installations/<installation_id>/repositories/<repo_id>`),
then set the same two secrets in the new repo.

Finally, note your App's **slug** (the lowercase name in the App's URL) —
the interpretation workflow needs it (next section). If you're reusing an
App you don't administer, the slug is also readable from any existing
instance: the `bots:` line of its `interpretation.md`, or the
`<slug>[bot]` author on its data-PRs.

## Repo / org settings

- **Settings → Actions → General → "Allow GitHub Actions to create and
  approve pull requests"** — must be enabled, and at the **org** level too if
  the repo belongs to an org (the org checkbox gates the repo one).

## The agent layer

The two `.md` workflows are [gh-aw](https://github.com/github/gh-aw) agentic
workflows: the agent runs read-only; writes land only through sanitized
`safe-outputs` confined by `allowed-files`.

1. **Fill the `TODO`s**: in `interpretation.md`, your App's slug under
   `bots:` and where your artifacts live under *Read*; in
   `comment-resolution.md`, the same artifact location. (When your instance
   grows workflows beyond the scaffolded two, the frontmatter reference is
   gh-aw's own documentation, linked from the
   [gh-aw repo](https://github.com/github/gh-aw) — the scaffold's patterns
   cover most of it, but they are examples, not the spec.)
2. **Choose engine/model.** The scaffold defaults to
   `gemini-3.1-flash-lite`, the configuration proven in the sample. The
   empirics that matter (measured 2026-07-02): one gh-aw session costs
   **~16–25 API requests**, so a 500-requests/day free tier sustains ~20–30
   sessions/day, while 20-RPD models leave **no headroom for even one
   debugging session** — don't pick them. Smaller "lite"-class models below
   flash-lite have failed gh-aw's harness protocol. Consumer chat
   subscriptions (Claude/Gemini/OpenAI OAuth) cannot back gh-aw — API keys
   only; Copilot Free can't pin a model. Whatever you choose, keep
   `timeout-minutes` and `allowed-files` — bounded cost is the point.
3. **Set the inference secret** the engine expects (for Gemini:
   `GEMINI_API_KEY`).
4. **Compile and commit**:

   ```sh
   gh aw compile
   git add .research .github
   git commit -m "continuous-research: instance scaffold"
   git push
   ```

   `compile` generates more than the `.lock.yml` files: also
   `.gitattributes`, `.github/aw/actions-lock.json` (the action SHA pins),
   and a maintenance workflow. Commit the whole generated set — the
   `.lock.yml` files *are* the runnable workflows.

   The **first compile prints a security warning** ("SECURITY REVIEW
   REQUIRED … New restricted secret(s): GEMINI_API_KEY") and still exits 0.
   That is expected, not a failure: gh-aw's safe-update mode is asking you
   to confirm that the new secret really should reach the inference engine
   (it is validated, passed only to the engine, and excluded from the
   firewall container's env). Review, then proceed.

## First run — verify the loop

1. Actions → **sense** → *Run workflow*. A healthy first run logs
   `[sense] {"action":"proposed",...}` (full outcome shapes:
   [cli.md → `sense`](./cli.md#sense)) and opens a PR titled
   `data: <descriptor>` with the `data:<descriptor>` label, containing the
   provenance stub + artifacts.
2. Within a minute or two the **interpretation** workflow should fire on that
   PR and push the impact declaration onto its branch. If it never fires, see
   *Troubleshooting* — this is almost always token identity. **Let it finish
   before merging or closing the PR:** finishing the PR early doesn't cancel
   the run — it keeps going, spends Actions minutes and inference quota, and
   its writes then land nowhere (the run reports `success` with zero effect,
   by design). On a small daily quota those wasted sessions add up.
3. Re-dispatch **sense** while the PR is open → `{"action":"skip","state":"pending"}`.
   No duplicate. This is dedup working.
4. **Merge** the PR, dispatch again → `skip/merged` (read off the provenance
   stub on the default branch).
5. Optional: force a fresh descriptor, close its PR unmerged with a comment →
   the **decline** workflow commits `.research/decisions/<descriptor>.md`
   with your comment as the reason; re-dispatch → `skip/declined`. (On
   org-owned repos with **private** membership, the reason falls back to the
   default text — see *Troubleshooting*.)
6. Try `/resolve <some small request>` as a comment on a data-PR — the
   comment-resolution agent should push the change and reply once.

When all of that holds, uncomment the cron. The loop is live.

## Driving the loop locally

CI is the loop's home, but you can drive the engine from a checkout — useful
for qualifying a sensor before the App is wired:

```sh
GITHUB_TOKEN=$(gh auth token) GITHUB_REPOSITORY=<owner>/<repo> \
  npx --yes github:norabble/continuous-research#v0.1.6 sense
```

Know what changes in this mode:

- **Your personal token is not the Actions token**, so the data-PRs it opens
  **do trigger the interpretation workflow** — every local proposal spends
  real inference quota. Budget for it (or hold off setting the inference
  secret until you want interpretation live).
- **Run from a disposable clone.** The sensor writes artifacts (and any
  registry state) into the working tree; after the data-PR merges, that
  residue collides with `git pull` in the checkout you ran from.
- **Push before you run** — the data-PR branches from the *remote* default
  branch head ([details](./cli.md#sense)).

## The mechanical impact layer (Phase 2 — preview)

An opt-in deterministic layer above the loop: annotate claims in your
findings prose, commit a machine-comparable `results.json` per edition, and
the `impact` command diffs editions, names the exact claims affected, and
lint-checks annotation↔results consistency — so the interpretation agent is
fed a cheap, precise "re-examine these" instead of the raw artifacts. It is
a **preview** (shipped since `v0.1.3`) and off unless `impact.enabled` is
set; enabling or disabling it never affects the sensing loop. Command,
config schema, and the `results.json` shape:
[cli.md → `impact`](./cli.md#impact--preview-since-v013-opt-in);
design: [phase-2-plan](./phase-2-plan.md).

## Going public

Instances are cheapest to run public (unlimited Actions minutes) and the live
site needs it — but flipping visibility exposes the loop's automated surfaces
all at once. This is the checklist proven on the sample, in order:

1. **Before flipping**, lock down the agent-consumed surfaces (the scaffold
   already locks the sensor-drift issue at creation) and confirm no secrets
   ever landed in history — a public repo's whole history is public.
2. **Flip visibility, then immediately:**
   - **Ruleset on `main`:** require pull requests, block force-push and
     deletion. Bypass actors: the repo admin and **your App only** —
     `GITHUB_TOKEN` can _never_ bypass a ruleset, which is exactly why the
     scaffolded `sense`/`decline` workflows write via the minted App token,
     not the workflow's own token.
   - **Actions → General:** require approval for fork PRs from outside
     collaborators (they otherwise run workflows on your dime).
   - **Enable secret scanning + push protection.**
   - Optionally enable **"require actions to be pinned to a full-length
     commit SHA."** The scaffolded workflows already comply — every `uses:`
     is SHA-pinned, including the inlined Pages upload (the stock
     `upload-pages-artifact` composite _fails_ this policy, because it calls
     `upload-artifact` by tag internally and the rule reaches nested
     references).
3. **Then enable the site** (`site.enabled: true`, Pages source "GitHub
   Actions" — full steps under _Publishing the live site_).

**The sensor-repair agent's threat model.** If you keep the optional
`sensor-repair.yml` Claude Code integration, understand what makes it safe on
a public repo. The workflow is split into two jobs so a **write-capable
GitHub token never enters the agent's environment**: the `repair` job runs
the agent with a read-only token and captures its fix as an uploaded
artifact; the deterministic `ship` job re-applies that patch (the sensor file
only, enforced mechanically), re-runs the tests, and only then mints a
downscoped App token to push the branch and open the PR. The agent reads
untrusted content (the sensor-drift issue, live API responses) over open
egress, so nothing in its environment may be worth stealing. The **Claude
OAuth token is the consciously accepted residual**: open egress is required
for source discovery, so exfiltration cannot be prevented outright —
revocation is the backstop. Do **not** broaden the agent's `--allowedTools`
list or add a write token to the `repair` job without re-doing this analysis;
either move reintroduces exactly the capability the two-job split removes.

## Publishing the live site

An opt-in, entirely read-only site for **followers of the research** —
readers who understand the findings but not GitHub. It renders
`findings.md` as the current findings, each open data-PR as a proposed
update ("awaiting the author's review," with an evidence record and an
excerpt of its impact assessment), and a quiet maintenance list for
everything else — no PR numbers, diffs, or other GitHub chrome. Command,
config schema, and exactly what it gathers:
[cli.md → `site`](./cli.md#site).

**Enable it:**

1. Set `site.enabled: true` (and a `title`) in `.research/config.json`.
2. Repo **Settings → Pages → Source: "GitHub Actions"**.
3. Dispatch the scaffolded **site** workflow (Actions → *site* → *Run
   workflow*). It also rebuilds on data-PR events and on pushes to the
   default branch that touch `findings.md` or `.research/`.

**Private repos:** GitHub Pages requires a **public** repository on free
plans. On a private instance, **leave the `site` workflow disabled** (and
`site.enabled` off) until you're ready to publish: with the site layer
enabled, the build succeeds but the deploy step fails against the
unavailable Pages site. You can still preview locally — run the
[`site` command](./cli.md#site) from a clone and open `_site/index.html`.

**Fail-closed:** a failed build never touches the deployed site — the
previously published pages stay up until the next successful run.

## Upgrading an instance

Instances pin the engine by tag, so nothing changes until you move the pin:

1. Read the [release notes](https://github.com/norabble/continuous-research/releases)
   between your current pin and the latest tag.
2. Bump the pin in **both** engine workflows — `sense.yml` *and*
   `decline.yml`. (Declines are rare; a stale `record-decline` pin can
   linger unnoticed for months.)
3. Apply any scaffold changes the notes call out. `init` never overwrites,
   so the reliable way to see template drift is to run the new version's
   `init` in a scratch directory and diff against your workflows. Example:
   v0.1.3 renamed the App secrets — upgrading means setting
   `CONTINUOUS_RESEARCH_APP_ID`/`CONTINUOUS_RESEARCH_APP_PRIVATE_KEY` and
   updating the token-mint step in `sense.yml` to match.
4. If any agentic `.md` workflow changed, `gh aw compile` and commit the
   regenerated locks.
5. Dispatch **sense** once — a healthy `none`/`skip` confirms the new pin
   runs end-to-end.

**Hardened mode — pin the engine to a commit, not a tag.** The scaffold pins
the engine by tag (`#v0.1.6`), and a tag is mutable: whoever can move it runs
on your next cron with your App token. Pinning to a full commit SHA instead —
`github:norabble/continuous-research#<full-sha>` — removes that trust in the
tag entirely. The trade-off is that upgrades become manual SHA bumps with no
release-notes signpost, so you own tracking what changed. One empirical caveat
if you take this path: a bare-commit git dependency installs only under **npm
11 (node 24)** — npm 10 (node 22) cannot (`GitFetcher requires an Arborist
constructor`), and archive tarballs are not a workaround (they skip
`prepare`, so no built `dist/`). The scaffolded engine workflows already run
node 24 for exactly this reason; keep it if you move to a commit pin. (The
_actions_ those workflows call are already SHA-pinned — this concerns only the
engine ref.)

## Guardrails you should keep

The scaffold ships these; keep them when you customize:

- `timeout-minutes` on every job; `concurrency` on sense (serialization is
  the duplicate-proposal guard under racing crons).
- `allowed-files` + `protected-files: allowed` on agent safe-outputs — the
  agent can only ever touch the impact files and the findings doc. Note
  `protected-files: allowed` is needed on **any** safe-output that writes
  under a top-level dot-folder — `create-pull-request` as much as
  `push-to-pull-request-branch`. A workflow PRing `.research/…` changes
  (e.g. a source registry) silently compiles to `request_review` without it.
- Cron matched to the data's real rhythm; agent triggers gated to trusted
  author associations (anonymous comments must not spend quota).
- Fail-closed inference: quota exhaustion stops agent runs; the
  deterministic engine keeps running free.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Data-PR opens but interpretation never fires | The PR wasn't App-authored (check the PR author is `your-app[bot]`): `CONTINUOUS_RESEARCH_APP_ID`/`CONTINUOUS_RESEARCH_APP_PRIVATE_KEY` missing (instances scaffolded before v0.1.3 used bare `APP_ID`/`APP_PRIVATE_KEY` — match whatever your `sense.yml` references) or the sense workflow isn't using the minted token. Or `bots:` in `interpretation.md` doesn't match your App slug. Recompile after edits. |
| `sense` fails: `GitHub Actions is not permitted to create ... pull requests` | Enable "Allow GitHub Actions to create and approve pull requests" — repo **and** org level. |
| `sense` fails parsing sensor output | The sensor must print exactly one JSON object to stdout ([contract](./cli.md#sensor-contract)); send logs to stderr. |
| Decline record says "no reason provided" despite a closing comment | On org-owned repos the workflow's `GITHUB_TOKEN` can't see **private** org membership, so a private MEMBER's comment reads as untrusted (`author_association: NONE`). Make the membership public, or accept the fallback text. [Details](./cli.md#record-decline). |
| `Invalid descriptor` | Descriptors must match `/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/` — lowercase, no leading/trailing punctuation. |
| `gh aw compile` errors on the scaffolded `.md` | Fill the `TODO`s first (an unreplaced `your-app-slug` is invalid); check the gh-aw version pinned in the `.lock.yml` header if recompiling an old instance. |
| Agent run starts, then fails without writing | Usually model quota (fail-closed by design) or a model that can't complete gh-aw's protocol — check the run log; prefer the proven model. |
| `npx github:...` is slow | ~15–20 s cold in CI (clone + install + build) is normal; it's cached within a job. Vendor the [bundle](./cli.md#invocation) if that's unacceptable. |
| Interpretation writes rejected | The agent tried to touch files outside `allowed-files` — that's the guardrail working. Widen the list only deliberately. |

## Costs, honestly

The deterministic engine spends nothing but Actions minutes (free on public
repos). Agent inference is bounded by your credential's own ceiling — a
free-tier key rate-limits, an API key should carry a spending limit
(cost-tier reasoning: [`CONCEPT.md`](../CONCEPT.md) → *Cost tiers*). A data
rhythm of days-to-months costs a few agent sessions per edition; the
expensive failure mode is an over-eager cron on an agentic sensor, which is
why the scaffold ships with the cron off.

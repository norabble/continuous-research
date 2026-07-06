# CLI + engine reference

The `continuous-research` package is both the **config CLI** (`init`) and the
**runtime engine** (`sense`, `record-decline`) the generated workflows invoke.
This is the complete reference for adopters; for the guided setup path, start
with the [adoption guide](./adopting.md). Vocabulary (descriptor, label,
edition, data-PR, provenance stub, decline record) is defined in
[`CONCEPT.md`](../CONCEPT.md) → *Canonical terms*.

## Invocation

| Context | Command |
| --- | --- |
| An instance's CI (the normal path) | `npx --yes github:norabble/continuous-research#v0.1.2 <command>` |
| Framework development | `npm run cli -- <command>` |
| No-npx fallback | vendor the bundle (`npm run build:bundle` → `bundle/continuous-research.mjs`) into the instance repo and `node engine/continuous-research.mjs <command>` |

Pin a tag (`#v0.1.2`), never a branch — the scaffold does this for you.
`--version` prints the resolved version; `--help` summarizes this page.

## Commands

### `init`

Scaffolds a Continuous Research instance into the current directory:

| File | What it is |
| --- | --- |
| `.research/config.json` | the instance's hook declarations (see *Config*) |
| `.github/workflows/sense.yml` | engine workflow: dispatch/cron → `sense` |
| `.github/workflows/decline.yml` | engine workflow: PR closed-unmerged → `record-decline` |
| `.github/workflows/interpretation.md` | gh-aw agentic workflow (compile with `gh aw compile`) |
| `.github/workflows/comment-resolution.md` | gh-aw agentic workflow (`/resolve` slash command) |

`init` **never overwrites** — existing files are reported and left alone, so
it is safe to run in a non-empty repository. It needs no network, tokens, or
git state, and it ends by printing the manual next steps (App creation,
secrets, `gh aw compile`). The two `.md` workflows contain `TODO` markers you
must fill in before compiling.

### `sense`

The heartbeat. Runs the declared `sensor` command, and if it reports a new
edition, dedups the descriptor against the repo's PR/provenance state and —
only when genuinely new — opens the data-PR.

**Environment (required):**

| Variable | Meaning |
| --- | --- |
| `GITHUB_TOKEN` (or `GH_TOKEN`) | API token the engine writes with. Must be the **App installation token** in CI — data-PRs opened with the default Actions token never trigger the interpretation workflow. |
| `GITHUB_REPOSITORY` | target repo as `owner/repo` (Actions provides it) |

**Behavior, in order:**

1. Read `.research/config.json`; execute the `sensor` command; parse one JSON
   detection result from its stdout (see *Sensor contract*).
2. `changed: false` → exit 0, outcome `none`. No GitHub call is made.
3. Otherwise classify the descriptor (see *Dedup semantics*):
   `merged` / `pending` / `declined` → exit 0, outcome `skip` — no duplicate
   PR is ever opened, so re-runs at any frequency are safe.
4. `new` → build the provenance stub, read each artifact file from the
   working tree, create branch `data/<descriptor>` from the default branch,
   commit the stub + artifacts, open the PR, apply the label
   `data:<descriptor>`. Outcome `proposed` with the PR number.

One line of JSON is logged — the outcome is exactly one of:

```
[sense] {"action":"none","reason":"sensor reported no change"}
[sense] {"action":"skip","state":"pending","descriptor":"btcusd-2026-07-01"}
[sense] {"action":"proposed","descriptor":"btcusd-2026-07-01","prNumber":12,"branch":"data/btcusd-2026-07-01"}
```

(`state` is `merged` / `pending` / `declined` — see *Dedup semantics*.)

**Working directory:** the engine resolves `.research/config.json`, executes
the sensor, and reads `artifacts` paths all against its own working directory
— the directory the CLI is invoked from (in Actions, the checkout root). Run
it from the repository root; artifact paths are repo-root-relative.

**Running locally:** artifacts are read from the *local* working tree, but
the `data/<descriptor>` branch is created from the **remote** default
branch's head. Push your latest commits before running `sense` locally, or
the data-PR's base may not contain the sensor that produced it. Two more
local-mode facts: (1) PRs opened with a **personal** token (e.g.
`GITHUB_TOKEN=$(gh auth token)`) **do** trigger the interpretation workflow
— unlike CI's workflow-issued token — so every local proposal spends real
agent quota; (2) the sensor mutates the working tree (artifacts, any
registry state it keeps), which later collides with `git pull` once the PR
merges — drive local runs from a disposable clone.

### `record-decline`

Runs from the `decline.yml` workflow when a pull request closes. Commits the
decline record for a data-PR the author closed **unmerged** — the factual log
that feeds the evolution narrative. Deterministic templating; no agent, no
inference.

**Environment (required):** `GITHUB_TOKEN`/`GH_TOKEN` and `GITHUB_REPOSITORY`
as above, plus `GITHUB_EVENT_PATH` — the event payload file (Actions provides
it).

**Behavior:** if the PR was merged, or carries no `data:<descriptor>` label,
it skips (exit 0). Otherwise it resolves the reason from the **latest trusted
comment** on the PR (author-association OWNER / MEMBER / COLLABORATOR;
untrusted comments are never quoted into the record), falling back to
`Closed without merge; no reason provided.`, and commits
`.research/decisions/<descriptor>.md` directly to the default branch.

> **Org-repo caveat:** `author_association` is computed relative to the
> *requesting token*. The decline workflow runs on the workflow-issued
> `GITHUB_TOKEN`, which cannot see **private** org membership — a private
> MEMBER therefore reads as `NONE`, their comment is untrusted, and the
> record falls back to the default text. Make your org membership public if
> you want closing comments captured on org-owned instances.

### `impact` — _unreleased (on `main`; not in `v0.1.2`)_

The deterministic half of the Phase-2 **mechanical impact layer**
([build plan](./phase-2-plan.md)). Opt-in: it refuses to run unless the
config's `impact.enabled` is `true`, and disabling it never affects the
sensing loop.

```
continuous-research impact <descriptor> [--against <prior-descriptor>]
```

**Environment (required):** `GITHUB_TOKEN`/`GH_TOKEN` and
`GITHUB_REPOSITORY`, as for `sense` (prior-edition reads come from the
default branch via the API).

**Behavior:**

1. Read the edition's `results.json` from the working tree at
   `impact.resultsPath` (with `${descriptor}` substituted) and parse the
   claim annotations from the findings file (`impact.findings`, default
   `findings.md`; grammar: `<!-- claim: <id> | backs: <keys> | status:
   <status> -->` — see the [Phase-2 plan](./phase-2-plan.md)).
2. With `--against <prior>`: read the **prior** edition's `results.json`
   from the **default branch** and diff — the changed keys, as dotted leaf
   paths. **Fail-closed:** a named baseline with no committed results is an
   error, never an empty diff. Without `--against`: no diff (first edition).
3. Select the **affected claims** — those whose `backs:` key changed
   (segment-boundary matching, so `close` never matches `close_vs_ma7_pct`).
4. Run the **consistency-linter** (advisory findings, never a merge gate;
   skipped if `impact.linter` is `false`).
5. Write `.research/impact/<descriptor>.impact.json`:
   `{ edition, baseline, changed, affected, lint }` — the cheap, exact
   "which claims to re-examine" the interpretation agent is fed.

**`results.json` shape:** any JSON object. It is flattened to **dotted leaf
paths** (`google.free.gemini-3.1-flash-lite.rpd`); arrays are leaves,
compared whole. `backs:` keys address those dotted paths, and a key also
covers everything beneath it (`google.free` matches `google.free.*`). Derive
`results.json` as the *machine-comparable* view of an edition — semantic
keys and values, not raw extracted markup.

**Path constraint:** `${descriptor}` is the **only** substitution
`impact.resultsPath` performs — the template must locate the file from the
descriptor alone. If your descriptors encode a family the path nests by
(`limits-google-3fa9c21b` under `data/limits/google/…`), the template cannot
extract it: store results flat instead (e.g. `results/${descriptor}.json`).

## Config — `.research/config.json`

```json
{
  "sensor": "node sensor.mjs",
  "impact": {
    "enabled": true,
    "resultsPath": "data/btcusd/${descriptor}.json"
  }
}
```

| Key | Type | Meaning |
| --- | --- | --- |
| `sensor` | string, required | shell command the engine executes to detect new data |
| `impact` | object, optional | Phase-2 mechanical impact layer; absent ⇒ layer off |
| `impact.enabled` | boolean, required in block | master toggle for the impact diff + linter |
| `impact.resultsPath` | string | where an edition's `results.json` lives; `${descriptor}` is substituted (required to run `impact`) |
| `impact.findings` | string | prose file the claim annotations are parsed from (default `findings.md`) |
| `impact.linter` | boolean | consistency-linter on/off (default on when enabled) |
| `impact.agentEngine` | `"gh-aw"` \| `"claude-code"` | **reserved** — validated but not yet acted on; a future `init` will scaffold the agent body for the chosen substrate |

The sensor (like the workflow files themselves) is trusted code: anyone who
can edit it controls what runs in CI. Review changes to it like workflow
changes.

## Sensor contract

The engine runs the `sensor` command as a child process and parses **one JSON
object** from its stdout. Either nothing changed:

```json
{ "changed": false }
```

or a new edition exists:

```json
{
  "changed": true,
  "descriptor": "btcusd-2026-06-27",
  "source": "https://api.example/btc?date=2026-06-27",
  "retrievedAt": "2026-06-27T00:00:00Z",
  "hash": "sha256:9f2c...",
  "artifacts": ["data/btcusd/2026-06-27.json"]
}
```

| Field | Rules |
| --- | --- |
| `descriptor` | the edition's identity under the project's scheme; **opaque to the engine**. Must match `/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/` (safe in labels, branch names, paths). Derive it from data *identity*, not location. |
| `source` | where the edition was obtained (URL / locator) |
| `retrievedAt` | ISO-8601 timestamp |
| `hash` | content hash formatted `algo:hexdigest`, e.g. `sha256:…` |
| `artifacts` | optional; paths the sensor has **already written into the working tree**. The engine reads them and commits them on the data-PR branch. Any repo-root-relative file path is allowed — including files under `.research/` (e.g. a sensor-maintained source registry riding the data-PR). Omitted ⇒ only the provenance stub is committed. |

Contract notes:

- One detection per run. If several editions are pending, report one; dedup
  makes the next cron pick up the rest safely.
- stdout must contain only the JSON object; log to stderr.
- A non-zero sensor exit or unparseable stdout fails the run (exit 1) —
  fail-closed, nothing is proposed.

## What the engine writes

| Surface | Value |
| --- | --- |
| Branch | `data/<descriptor>` (from the **remote** default branch's head) |
| PR title | `data: <descriptor>` |
| PR body | templated impact-declaration stub (source / retrieved / hash); the agent layer replaces this with prose interpretation on the PR branch |
| Label | `data:<descriptor>` — the dedup key; do not remove it |
| Provenance stub | `.research/provenance/<descriptor>.json`, schema `continuous-research/provenance@v1`: `{ schema, descriptor, source, retrievedAt, hash }`. Committed on the data-PR branch; lands on the default branch at merge, where it is the durable "merged" marker. |
| Decline record | `.research/decisions/<descriptor>.md` — YAML frontmatter (`descriptor`, `declined_at`, `data_pr`, `declined_by`) + the reason as body; committed straight to the default branch |
| Commit messages | `data(<descriptor>): add <path>` / `decline(<descriptor>): record reason` |

## Dedup semantics

Three states are read off the data-PR's own state plus the provenance stub —
no separate watermark, no race:

| State | Signal | Action |
| --- | --- | --- |
| `merged` | provenance stub exists on the default branch, or a merged PR labeled `data:<descriptor>` | skip |
| `pending` | an open PR with the label | skip |
| `declined` | a closed-unmerged PR with the label | skip (the deterministic engine never re-proposes a declined descriptor; a revision should get a new descriptor, e.g. `oews-2026r1`) |
| `new` | none of the above | propose |

Precedence when a descriptor spans states: merged > pending > declined.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | success — including every deliberate no-op (`changed: false`, dedup skip, decline skip) |
| 1 | error: unknown command, missing env, config/sensor-output validation failure, GitHub API failure. Message on stderr. |

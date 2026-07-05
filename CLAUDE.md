# CLAUDE.md

Guidance for working in this repo. Keep it short — it loads every session.

## What this is

The **Continuous Research** framework (a substrate for research-as-a-living-
artifact). Design source of truth: [`CONCEPT.md`](./CONCEPT.md). Build plan:
[`docs/phase-1-plan.md`](./docs/phase-1-plan.md). Read those before changing
behavior — don't re-derive the design.

## Stack

TypeScript (ESM, strict) · Node ≥ 22 · vitest · ESLint (typescript-eslint,
type-checked) · Prettier. The package is _both_ the config CLI and the runtime
engine (`src/cli.ts`).

## Commands

- `npm run check` — typecheck + lint + format check + tests. **Run before committing.**
- `npm test` / `npm run test:watch` — vitest.
- `npm run typecheck` — `tsc --noEmit`.
- `npm run lint` / `npm run lint:fix`.
- `npm run format` / `npm run format:check`.
- `npm run cli -- <command>` — run the CLI in dev.

## Conventions

- **ESM only.** Use `import type` for type-only imports (`verbatimModuleSyntax`).
- **Prettier owns formatting; ESLint owns correctness.** Don't hand-format code.
  Markdown is prettier-ignored — the design docs are hand-wrapped (~80 col);
  preserve that, don't reflow them.
- **Ports-and-adapters (load-bearing).** Keep core logic _pure_ and free of I/O;
  put I/O behind a port interface (`src/ports.ts`) and inject it. Pure cores
  (e.g. `dedup.classify`) must stay unit-testable without GitHub — this is the
  reason the project is structured the way it is (phase-1-plan, design rule 1).
- **Vocabulary.** Use the terms in CONCEPT.md → _Canonical terms_ (descriptor,
  label, edition, data-PR, provenance stub, decline record). Don't coin synonyms.
- **The descriptor _scheme_ is project-defined**; the framework provides only the
  _mechanism_ (`src/descriptor.ts`).

## Tests

vitest, co-located as `src/*.test.ts`. Test pure functions by **injecting facts**
(PR lists, flags); use **fakes** for ports — don't call real GitHub.

## Commits

Imperative subject; the body explains the **why**, not just the what. End with
a `Co-Authored-By: Claude <model name> <noreply@anthropic.com>` trailer, where
`<model name>` is **the model you are actually running as** (e.g. `Claude Opus
4.8`, `Claude Fable 5`) — substitute your own, don't copy the example. The
repo's own git history is meant to demonstrate the "evolution narrative" idea —
keep it legible.
(Early bootstrapping commits go straight to `main`; this moves to PR-based as the
framework matures.)

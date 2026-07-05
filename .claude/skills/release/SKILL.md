---
name: release
description: Cut a versioned release of the continuous-research framework. Bumps the version and updates every scaffold npx pin AND its test expectation together, runs the gate, commits, tags, pushes over HTTPS, and verifies the public npx path. Use when asked to release, cut a version, tag vX.Y.Z, or publish the framework.
disable-model-invocation: true
---

# Release the framework

Cut `vX.Y.Z` of `norabble/continuous-research`. The **load-bearing invariant:**
the scaffold's `npx github:…#vX.Y.Z` pins and the test that asserts them move
together with `package.json` — or adopters silently get a stale engine.

## Preconditions

- On `main`, clean tree, `git pull` up to date.
- New version `X.Y.Z` chosen (semver: patch for fixes, minor for features).

## Steps

1. **Capture versions.** `CUR=$(node -p "require('./package.json').version")`;
   set `NEW` to the target; confirm `CUR` != `NEW`.

2. **Find every pin site — do not assume there are only two:**
   `grep -rn "continuous-research#v$CUR" src/ docs/` and the `package.json`
   version. Expected sites: `src/scaffold.ts` (the `sense` and `decline`
   workflow npx lines), `src/scaffold.test.ts` (the `toContain("…#vNEW sense")`
   expectation), `docs/cli.md` + `docs/adopting.md` (invocation examples),
   `package.json`.

3. **Bump them all** `#v$CUR` → `#v$NEW`, and `package.json` version → `$NEW`.
   The scaffold pin and its test expectation are the pair that MUST match — a
   mismatch fails the gate loudly (good) or ships a stale pin (bad).

4. **Gate:** `npm run check` — must pass (typecheck + lint + format + tests).

5. **Commit** (imperative subject; body says why; trailer
   `Co-Authored-By: Claude <working model> <noreply@anthropic.com>`):
   `Release v$NEW: <one-line summary>`.

6. **Tag + push over HTTPS** (SSH has no key in this env):
   `git tag v$NEW && git push origin main && git push origin v$NEW`.

7. **Verify the public path** from a scratch dir (the pin adopters actually use):
   `cd "$(mktemp -d)" && npx --yes github:norabble/continuous-research#v$NEW --version`
   → prints `$NEW`; `--help` shows current text; the raw docs URLs return 200.

## Failure modes

- `npm run check` fails on a scaffold-pin test → you missed the
  `scaffold.test.ts` expectation in step 3.
- `npx …#v$NEW` 404s → the tag didn't push; re-run step 6's tag push.

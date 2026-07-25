import { defineConfig } from "tsup";

/**
 * Vendor build: a single self-contained ESM file (all deps, incl. octokit,
 * inlined) for instances that vendor the engine instead of installing it — see
 * docs/phase-1-plan.md "Running the (unpublished) engine in CI". Output is
 * `bundle/continuous-research.mjs`, runnable with `node` and no npm install.
 */
export default defineConfig({
  entry: { "continuous-research": "src/cli.ts" },
  format: ["esm"],
  target: "node22",
  noExternal: [/.*/],
  // Inlined CJS dependencies still call `require` at runtime (`yaml` resolves
  // to its CJS build — its exports map offers ESM only under the browser
  // condition — and requires "process" on load). An ESM bundle has no
  // `require`, so esbuild substitutes a shim that throws. Defining a real one
  // satisfies the shim's `typeof require !== "undefined"` guard and makes the
  // vendor bundle runnable. `npm run build:bundle && node
  // bundle/continuous-research.mjs --version` is the check that this holds.
  banner: {
    js: [
      'import { createRequire as __ccrCreateRequire } from "node:module";',
      "const require = __ccrCreateRequire(import.meta.url);",
    ].join("\n"),
  },
  splitting: false,
  clean: false,
  dts: false,
  sourcemap: false,
  outDir: "bundle",
  outExtension: () => ({ js: ".mjs" }),
});

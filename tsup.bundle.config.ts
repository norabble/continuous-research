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
  splitting: false,
  clean: false,
  dts: false,
  sourcemap: false,
  outDir: "bundle",
  outExtension: () => ({ js: ".mjs" }),
});

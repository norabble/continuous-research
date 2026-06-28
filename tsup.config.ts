import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts", "src/index.ts"],
  format: ["esm"],
  target: "node22",
  clean: true,
  // dts deferred: tsup's declaration build trips a TS6 `baseUrl` deprecation,
  // and the sample consumes the CLI via `bin`, not the library types. Re-enable
  // when publishing a typed library.
  dts: false,
  sourcemap: false,
});

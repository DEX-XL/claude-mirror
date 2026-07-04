import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  target: "node18",
  clean: true,
  minify: false,
  // Bundle everything into a single-file CLI. Keep the shebang, and shim
  // require() for CJS deps (adm-zip) bundled into the ESM output.
  banner: {
    js: '#!/usr/bin/env node\nimport { createRequire as __cr } from "node:module"; const require = __cr(import.meta.url);',
  },
  noExternal: [/.*/],
});

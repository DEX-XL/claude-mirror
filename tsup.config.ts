import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  target: "node18",
  clean: true,
  minify: false,
  // Bundle everything into a single-file CLI. Keep the shebang.
  banner: { js: "#!/usr/bin/env node" },
  noExternal: [/.*/],
});

import { defineConfig } from "tsup";

/**
 * Bundle the Telos CLI (and the pure @telos/* workspace code it imports) into a
 * single ESM file for the published `telos` package. Native and heavy runtime
 * deps stay external — they're installed from the package's dependencies, not
 * inlined. The entry (src/main.ts) already carries the `#!/usr/bin/env node`
 * shebang, which esbuild preserves — so no banner is needed (adding one would
 * produce a duplicate shebang and a syntax error).
 */
export default defineConfig({
  entry: { main: "src/main.ts" },
  outDir: "dist-bundle",
  format: ["esm"],
  target: "node20",
  platform: "node",
  bundle: true,
  splitting: false,
  clean: true,
  // Keep native/heavy deps external; bundle the @telos/* workspace packages in.
  external: [
    "better-sqlite3",
    "web-tree-sitter",
    "fastify",
    "@fastify/static",
    "commander",
    "open",
    "@modelcontextprotocol/sdk",
    "@anthropic-ai/claude-agent-sdk",
  ],
});

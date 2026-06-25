/**
 * Assemble the publishable `telos` package.
 *
 * Builds the workspace, the web SPA and the bundled CLI, then copies the
 * runtime assets into this directory in the layout the published package
 * expects: dist/main.js + grammars/ + languages/ + web/ + README + LICENSE.
 * After running this, `npm pack` (or `npm publish`) here produces the tarball.
 *
 * Usage:  node publish/build.mjs       (or: pnpm --dir publish assemble)
 */
import { execSync } from "node:child_process";
import { cpSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = dirname(here);
const run = (cmd) => { console.log(`\n$ ${cmd}`); execSync(cmd, { cwd: repo, stdio: "inherit" }); };
const copy = (from, to) => {
  const src = join(repo, from);
  if (!existsSync(src)) throw new Error(`missing build output: ${from} — did the build step run?`);
  const dest = join(here, to);
  rmSync(dest, { recursive: true, force: true });
  cpSync(src, dest, { recursive: true });
  console.log(`  copied ${from} -> publish/${to}`);
};

console.log("Assembling the publishable `telos` package…");

// 1. Build the workspace (engine/server/harness/mcp/forge/resolve/cli tsc),
//    the web SPA, and the bundled CLI.
run("pnpm -r build");
run("pnpm --filter @telos/web build");
run("pnpm --filter @telos/cli bundle");

// 2. Assemble the published layout.
mkdirSync(join(here, "dist"), { recursive: true });
copy("packages/cli/dist-bundle/main.js", "dist/main.js");
copy("packages/engine/grammars", "grammars");
copy("packages/engine/languages", "languages");
copy("apps/web/dist", "web");
copy("README.md", "README.md");
copy("LICENSE", "LICENSE");

console.log("\n✓ publish/ assembled. Next: cd publish && npm pack   (then `npm publish`).");

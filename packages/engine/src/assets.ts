/**
 * Single source of truth for where Telos's shipped assets live — the grammars
 * (`.wasm`), the language manifests (`languages/`), and the built web SPA.
 *
 * In the dev pnpm workspace these sit at fixed offsets from the engine source.
 * Once the CLI is bundled into a flat `dist/main.js` for the published `telos`
 * package, those `import.meta.url` offsets break — so instead we resolve the
 * package root by walking up to the directory that actually contains
 * `grammars/`. A `TELOS_ASSET_ROOT` env override short-circuits everything for
 * unusual install layouts.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

let cached: string | null = null;

/** The directory that holds `grammars/` (and, when published, `languages/` and
 *  `web/`). Resolved once and cached. */
export function assetRoot(): string {
  const env = process.env.TELOS_ASSET_ROOT;
  if (env && env.trim()) return env.trim();
  if (cached) return cached;
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, "grammars"))) { cached = dir; return dir; }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: the engine package root (dev layout: src/assets.ts -> ..).
  cached = dirname(dirname(fileURLToPath(import.meta.url)));
  return cached;
}

/** Directory containing the tree-sitter `.wasm` grammars. */
export function grammarsDir(): string { return join(assetRoot(), "grammars"); }

/** Directory containing the `languages/<id>/` manifests. */
export function languagesDir(): string {
  // Published layout: <root>/languages. Dev layout: packages/engine/languages,
  // which is also <assetRoot>/languages since assetRoot resolves to the engine
  // package root there.
  return join(assetRoot(), "languages");
}

/** Directory containing the built web SPA (index.html + assets). Published as
 *  `<root>/web`; in dev it lives at the monorepo's `apps/web/dist`. */
export function webDistDir(): string {
  const env = process.env.TELOS_ASSET_ROOT;
  if (env && env.trim()) return join(env.trim(), "web");
  const published = join(assetRoot(), "web");
  if (existsSync(published)) return published;
  // Dev monorepo: assetRoot is packages/engine; web lives at apps/web/dist.
  return join(assetRoot(), "..", "..", "apps", "web", "dist");
}

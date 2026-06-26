import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ProductContext } from "@telos/harness";

// Engine-FREE read/write of the product context (languages/layers derived from
// the graph). The full derivation needs @telos/engine (sqlite); caching it to a
// plain JSON file lets the lightweight per-prompt hook stay product-aware without
// loading the heavy engine on its hot path. Written during `scan`/`serve`.

const FILE = "product-context.json";

export function writeProductContextCache(telosDir: string, ctx: ProductContext): void {
  try {
    mkdirSync(telosDir, { recursive: true });
    writeFileSync(join(telosDir, FILE), JSON.stringify(ctx));
  } catch {
    // best-effort cache; routing still works without it
  }
}

/** Read the cached product context, or null when absent/unreadable. */
export function readProductContextCache(telosDir: string): ProductContext | null {
  try {
    const path = join(telosDir, FILE);
    if (!existsSync(path)) return null;
    const c = JSON.parse(readFileSync(path, "utf8")) as Partial<ProductContext>;
    return {
      languages: Array.isArray(c.languages) ? c.languages : [],
      layers: Array.isArray(c.layers) ? c.layers : [],
      changedFiles: Array.isArray(c.changedFiles) ? c.changedFiles : [],
    };
  } catch {
    return null;
  }
}

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { GraphStore } from "@telos/engine";
import type { ProductContext } from "@telos/harness";

/**
 * Derive what the product *is* from the scanned graph, so the harness planner can
 * bias routing toward the languages/layers actually present. Returns empty arrays
 * when no graph has been built yet — the planner then routes on the prompt alone.
 */
export function productContextFromGraph(path: string): ProductContext {
  const empty: ProductContext = { languages: [], layers: [], changedFiles: [] };
  const dbPath = join(resolve(path), ".telos", "graph.db");
  if (!existsSync(dbPath)) return empty;

  const store = GraphStore.open(dbPath);
  try {
    const { nodes } = store.loadGraph();
    const languages = new Set<string>();
    const layers = new Set<string>();
    for (const n of nodes) {
      if (n.kind === "file" && n.language) languages.add(n.language.toLowerCase());
      if (n.layer) layers.add(String(n.layer).toLowerCase());
    }
    return { languages: [...languages], layers: [...layers], changedFiles: [] };
  } catch {
    return empty;
  } finally {
    store.close();
  }
}

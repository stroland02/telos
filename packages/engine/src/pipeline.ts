import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { walk } from "./walker.js";
import { Parser } from "./parser.js";
import { extractFile } from "./extractor.js";
import { resolveGraph } from "./resolver.js";
import { GraphStore } from "./store.js";
import { TelosGraph, TelosNode, TelosEdge } from "./schema.js";

/** Parse + resolve a repo into a graph. Pure: writes nothing to disk. */
export async function scanGraph(repoRoot: string): Promise<TelosGraph> {
  const files = await walk(repoRoot);
  const parser = await Parser.create();
  const nodes: TelosNode[] = []; const edges: TelosEdge[] = [];

  try {
    for (const f of files) {
      const source = await readFile(f.path, "utf8");
      const tree = parser.parse(source, f.language);
      const relPath = relative(repoRoot, f.path).replace(/\\/g, "/");
      const r = extractFile({ tree, source, relPath, language: f.language });
      nodes.push(...r.nodes); edges.push(...r.edges);
      tree.delete();
    }
  } finally {
    parser.dispose();
  }
  return resolveGraph({ nodes, edges });
}

/** Scan a repo and persist the graph to <repoRoot>/.telos/graph.db. */
export async function scan(repoRoot: string): Promise<{ dbPath: string; graph: TelosGraph }> {
  const graph = await scanGraph(repoRoot);
  const telosDir = join(repoRoot, ".telos");
  mkdirSync(telosDir, { recursive: true });
  const dbPath = join(telosDir, "graph.db");
  const store = GraphStore.open(dbPath);
  store.save(graph); store.close();
  return { dbPath, graph };
}

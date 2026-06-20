import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { walk } from "./walker.js";
import { Parser } from "./parser.js";
import { extractFile } from "./extractor.js";
import { resolveGraph } from "./resolver.js";
import { GraphStore } from "./store.js";
import { TelosGraph, TelosNode, TelosEdge } from "./schema.js";

export async function scan(repoRoot: string): Promise<{ dbPath: string; graph: TelosGraph }> {
  const files = await walk(repoRoot);
  const parser = await Parser.create();
  const nodes: TelosNode[] = []; const edges: TelosEdge[] = [];

  for (const f of files) {
    const source = await readFile(f.path, "utf8");
    const tree = parser.parse(source, f.language);
    const relPath = relative(repoRoot, f.path).replace(/\\/g, "/");
    const r = extractFile({ tree, source, relPath, language: f.language });
    nodes.push(...r.nodes); edges.push(...r.edges);
  }

  const graph = resolveGraph({ nodes, edges });
  const telosDir = join(repoRoot, ".telos");
  mkdirSync(telosDir, { recursive: true });
  const dbPath = join(telosDir, "graph.db");
  const store = GraphStore.open(dbPath);
  store.save(graph); store.close();
  return { dbPath, graph };
}

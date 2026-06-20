import { readFileSync } from "node:fs";
import type WebTreeSitter from "web-tree-sitter";
import type { TelosNode, TelosEdge, NodeKind } from "./schema.js";
import { createNodeId } from "./schema.js";
import { extractQueryPath } from "./languages/registry.js";
import type { TSTree } from "./parser.js";

const queryCache = new Map<string, string>();
function querySource(language: string): string {
  if (!queryCache.has(language)) queryCache.set(language, readFileSync(extractQueryPath(language), "utf8"));
  return queryCache.get(language)!;
}

const CAPTURE_KIND: Record<string, NodeKind> = {
  "function.name": "function", "class.name": "class",
  "method.name": "method", "interface.name": "interface",
};

function baseNode(
  kind: NodeKind,
  name: string,
  relPath: string,
  language: string,
  node: WebTreeSitter.SyntaxNode,
): TelosNode {
  const qualifiedName = kind === "file" ? relPath : `${relPath}:${name}`;
  return {
    id: createNodeId(relPath, qualifiedName),
    kind, name, qualifiedName, language, path: relPath,
    lineStart: node.startPosition.row + 1, lineEnd: node.endPosition.row + 1,
    layer: "unknown", fanIn: 0, fanOut: 0,
    lines: node.endPosition.row - node.startPosition.row + 1,
    complexity: 0, summary: null,
  };
}

export function extractFile(args: {
  tree: TSTree; source: string; relPath: string; language: string;
}): { nodes: TelosNode[]; edges: TelosEdge[] } {
  const { tree, relPath, language } = args;
  const root = tree.rootNode;
  const fileNode = baseNode("file", relPath, relPath, language, root);
  const nodes: TelosNode[] = [fileNode];
  const edges: TelosEdge[] = [];

  // Tree.getLanguage() is defined in the web-tree-sitter d.ts (Tree interface, line 158).
  const lang = tree.getLanguage();
  const query = lang.query(querySource(language));
  for (const m of query.matches(root)) {
    for (const cap of m.captures) {
      const kind = CAPTURE_KIND[cap.name];
      if (kind) {
        const symbol = baseNode(kind, cap.node.text, relPath, language, cap.node);
        nodes.push(symbol);
        edges.push({ sourceId: fileNode.id, targetId: symbol.id, kind: "contains", resolved: true });
      } else if (cap.name === "call.name") {
        // Unresolved intra/inter-file call; Resolver (Task 5) binds target by name.
        edges.push({
          sourceId: fileNode.id,
          targetId: createNodeId("?", cap.node.text), // placeholder name-id
          kind: "calls", resolved: false,
        });
      }
    }
  }
  return { nodes, edges };
}

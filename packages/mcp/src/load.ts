import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { GraphStore } from "@telos/engine";
import { ToolContext } from "./tools.js";

export function loadContext(dbPath: string): ToolContext {
  if (!existsSync(dbPath)) {
    throw new Error(`Telos graph.db not found at "${dbPath}". Run \`telos scan\` first.`);
  }
  const store = GraphStore.open(dbPath);
  // graph.db lives at <repo>/.telos/graph.db → telosDir is its parent.
  return { graph: store.loadGraph(), store, telosDir: dirname(dbPath) };
}

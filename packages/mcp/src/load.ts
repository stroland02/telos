import { existsSync } from "node:fs";
import { GraphStore } from "@telos/engine";
import { ToolContext } from "./tools.js";

export function loadContext(dbPath: string): ToolContext {
  if (!existsSync(dbPath)) {
    throw new Error(`Telos graph.db not found at "${dbPath}". Run \`telos scan\` first.`);
  }
  const store = GraphStore.open(dbPath);
  return { graph: store.loadGraph(), store };
}

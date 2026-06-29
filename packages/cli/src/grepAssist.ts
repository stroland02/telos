/**
 * grep-assist — a Claude Code PreToolUse hook on Grep/Glob that answers from the
 * Telos graph instead of letting the agent cold-search the filesystem. Modeled on
 * the proven codebase-memory-mcp mechanism: if the search term matches indexed
 * symbols, inject structured graph hits as `additionalContext` and exit 0 (never
 * block — grep still runs on a miss). Makes the graph-over-grep substitution real
 * and visible (each assist is recorded to .telos/mcp-activity.jsonl).
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { GraphStore, type TelosNode } from "@telos/engine";
import { recordMcpQuery, estimateTokens } from "@telos/harness";

/** Pull the search term from a PreToolUse stdin payload (Grep `pattern`, Glob
 *  `pattern`/`query`). Returns null on anything unparseable — caller stays silent. */
export function readStdinPattern(raw: string): string | null {
  try {
    const j = JSON.parse(raw) as { tool_input?: { pattern?: string; query?: string } };
    const p = j.tool_input?.pattern ?? j.tool_input?.query;
    return typeof p === "string" && p.trim() ? p.trim() : null;
  } catch {
    return null;
  }
}

/** Render matched graph nodes as the additionalContext block, or null if none. */
export function formatGrepAssist(nodes: TelosNode[], pattern: string, limit = 8): string | null {
  if (!nodes.length) return null;
  const rows = nodes.slice(0, limit).map((n) => {
    const loc = n.lineStart ? `${n.path}:${n.lineStart}` : n.path;
    return `  • ${n.qualifiedName} — ${n.kind}/${n.layer} (${loc})`;
  });
  return [
    `⟢ Telos graph memory matched "${pattern}" (${nodes.length} symbol${nodes.length === 1 ? "" : "s"}).`,
    `Prefer the telos_* MCP tools (telos_explore / telos_ask / telos_callers) over Grep/Glob for structural or cross-file questions:`,
    ...rows,
  ].join("\n");
}

/** PreToolUse hook entry: read stdin, query the graph, emit additionalContext.
 *  Always resolves (exit 0 upstream) — assist must never block a tool call. */
export async function runGrepAssist(repoRoot: string, stdin: string): Promise<void> {
  const pattern = readStdinPattern(stdin);
  if (!pattern) return;
  const telosDir = join(repoRoot, ".telos");
  const dbPath = join(telosDir, "graph.db");
  if (!existsSync(dbPath)) return;

  let nodes: TelosNode[] = [];
  let store: GraphStore | null = null;
  try {
    store = GraphStore.open(dbPath);
    nodes = store.search(pattern).slice(0, 8);
  } catch {
    return; // best-effort: a bad/locked db must never break grep
  } finally {
    store?.close();
  }

  const context = formatGrepAssist(nodes, pattern);
  if (!context) return;

  // Record so the control panel can show "graph pre-answered N grep attempts".
  recordMcpQuery(telosDir, { ts: Date.now(), tool: "grep-assist", argsSummary: pattern.slice(0, 200), resultTokens: estimateTokens(context) });

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: context },
  }));
}

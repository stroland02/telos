import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

// One MCP tool call the agent made against the graph. Append-only so the web
// panel can show, over a session, how Telos fed the agent instead of cold reads.
export interface McpActivityEntry {
  ts: number;
  tool: string;
  argsSummary: string;
  resultTokens: number;
}

export interface McpActivityFeed {
  entries: McpActivityEntry[];
  totals: { queries: number; tokens: number };
}

function logPath(telosDir: string): string {
  return join(telosDir, "mcp-activity.jsonl");
}

/** Append one MCP query. Best-effort — never throws (must not break a tool call). */
export function recordMcpQuery(telosDir: string, entry: McpActivityEntry): void {
  try {
    const path = logPath(telosDir);
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, JSON.stringify(entry) + "\n");
  } catch {
    // best-effort
  }
}

/** Read the most recent N entries (newest first); totals span the whole log. */
export function readMcpActivity(telosDir: string, limit = 50): McpActivityFeed {
  const path = logPath(telosDir);
  if (!existsSync(path)) return { entries: [], totals: { queries: 0, tokens: 0 } };
  let lines: string[] = [];
  try {
    lines = readFileSync(path, "utf8").split("\n").filter((l) => l.trim());
  } catch {
    return { entries: [], totals: { queries: 0, tokens: 0 } };
  }
  const parsed: McpActivityEntry[] = [];
  for (const line of lines) {
    try { parsed.push(JSON.parse(line) as McpActivityEntry); } catch { /* skip malformed */ }
  }
  const totals = {
    queries: parsed.length,
    tokens: parsed.reduce((sum, e) => sum + (e.resultTokens || 0), 0),
  };
  return { entries: parsed.slice(-limit).reverse(), totals };
}

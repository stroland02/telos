import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

// Token estimate. Kept local (not imported from @telos/engine) so the per-prompt
// hook that imports this module stays engine-free. Matches engine/estimateTokens.
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// One recorded orchestration: which workflow Telos planned for a prompt, and
// which agents/harnesses it routed to. Append-only so the web feed can prove,
// over time, that harnesses are doing real work.
export interface ActivityEntry {
  ts: number;
  promptSnippet: string;
  intent: string;
  agents: string[];
  sources: string[];
  /** Estimated tokens of the context block this prompt injected. */
  injectedTokens?: number;
  /** The injected context block (truncated by the writer). */
  block?: string;
}

export interface ActivityFeed {
  entries: ActivityEntry[];
  tally: { id: string; count: number }[];
}

function logPath(telosDir: string): string {
  return join(telosDir, "activity.jsonl");
}

/** Append one orchestration to the activity log. Best-effort — never throws. */
export function recordActivity(telosDir: string, entry: ActivityEntry): void {
  try {
    const path = logPath(telosDir);
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, JSON.stringify(entry) + "\n");
  } catch {
    // recording is best-effort; a failed write must not break the hook
  }
}

/** Read the most recent N entries (newest first) plus an agent-id tally. */
export function readActivity(telosDir: string, limit = 50): ActivityFeed {
  const path = logPath(telosDir);
  if (!existsSync(path)) return { entries: [], tally: [] };
  let lines: string[] = [];
  try {
    lines = readFileSync(path, "utf8").split("\n").filter((l) => l.trim());
  } catch {
    return { entries: [], tally: [] };
  }
  const parsed: ActivityEntry[] = [];
  for (const line of lines) {
    try { parsed.push(JSON.parse(line) as ActivityEntry); } catch { /* skip malformed */ }
  }
  const entries = parsed.slice(-limit).reverse();

  const counts = new Map<string, number>();
  for (const e of parsed) for (const id of e.agents) counts.set(id, (counts.get(id) ?? 0) + 1);
  const tally = [...counts.entries()]
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));

  return { entries, tally };
}

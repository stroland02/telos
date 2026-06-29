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

/** Parse all well-formed entries from the log (oldest first); [] if missing. */
function parseEntries(telosDir: string): ActivityEntry[] {
  const path = logPath(telosDir);
  if (!existsSync(path)) return [];
  let lines: string[] = [];
  try {
    lines = readFileSync(path, "utf8").split("\n").filter((l) => l.trim());
  } catch {
    return [];
  }
  const parsed: ActivityEntry[] = [];
  for (const line of lines) {
    try { parsed.push(JSON.parse(line) as ActivityEntry); } catch { /* skip malformed */ }
  }
  return parsed;
}

/** Read the most recent N entries (newest first) plus an agent-id tally. */
export function readActivity(telosDir: string, limit = 50): ActivityFeed {
  const parsed = parseEntries(telosDir);
  const entries = parsed.slice(-limit).reverse();

  const counts = new Map<string, number>();
  for (const e of parsed) for (const id of e.agents) counts.set(id, (counts.get(id) ?? 0) + 1);
  const tally = [...counts.entries()]
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));

  return { entries, tally };
}

// Rolling usage over the most recent routed prompts — the dynamic "what is
// actually being used right now" signal (vs. static catalog inventory). "Used"
// means routed/dispatched by Telos's planner, the only usage Telos observes.
export interface UsageStats {
  windowPrompts: number; // routed prompts considered (<= window)
  agents: { id: string; count: number; lastTs: number }[]; // distinct agents, busiest first
  sources: { source: string; count: number; lastTs: number }[]; // per-harness (id before ":")
}

// Longevity view: how Telos was used over the project's life, from the full log
// (not a rolling window). Powers the History tab — usage + injected-token trend.
export interface HistoryDay { day: string; prompts: number; agents: number; injectedTokens: number }
export interface HistoryStats {
  totalPrompts: number;       // prompts that routed at least one agent
  totalInjected: number;      // Σ injectedTokens across all such prompts
  distinctAgents: number;     // distinct agents ever routed
  firstTs: number | null;
  lastTs: number | null;
  days: HistoryDay[];         // chronological, one entry per active day
}

/** Aggregate the whole activity log into per-day usage + injected-token trend. */
export function computeHistory(telosDir: string): HistoryStats {
  const routed = parseEntries(telosDir).filter((e) => Array.isArray(e.agents) && e.agents.length > 0);
  const allAgents = new Set<string>();
  const byDay = new Map<string, { prompts: number; agents: Set<string>; injectedTokens: number }>();
  let totalInjected = 0;
  let firstTs: number | null = null;
  let lastTs: number | null = null;

  for (const e of routed) {
    const day = new Date(e.ts).toISOString().slice(0, 10);
    const d = byDay.get(day) ?? { prompts: 0, agents: new Set<string>(), injectedTokens: 0 };
    d.prompts++;
    d.injectedTokens += e.injectedTokens ?? 0;
    for (const id of e.agents) { d.agents.add(id); allAgents.add(id); }
    byDay.set(day, d);
    totalInjected += e.injectedTokens ?? 0;
    firstTs = firstTs === null ? e.ts : Math.min(firstTs, e.ts);
    lastTs = lastTs === null ? e.ts : Math.max(lastTs, e.ts);
  }

  const days: HistoryDay[] = [...byDay.entries()]
    .map(([day, d]) => ({ day, prompts: d.prompts, agents: d.agents.size, injectedTokens: d.injectedTokens }))
    .sort((a, b) => a.day.localeCompare(b.day));

  return { totalPrompts: routed.length, totalInjected, distinctAgents: allAgents.size, firstTs, lastTs, days };
}

/** Tally agent/harness usage across the last `window` prompts that routed agents. */
export function computeUsage(telosDir: string, window = 20): UsageStats {
  const recent = parseEntries(telosDir)
    .filter((e) => Array.isArray(e.agents) && e.agents.length > 0)
    .slice(-window);

  const agents = new Map<string, { count: number; lastTs: number }>();
  const sources = new Map<string, { count: number; lastTs: number }>();
  const bump = (m: Map<string, { count: number; lastTs: number }>, key: string, ts: number) => {
    const v = m.get(key) ?? { count: 0, lastTs: 0 };
    m.set(key, { count: v.count + 1, lastTs: Math.max(v.lastTs, ts) });
  };
  for (const e of recent) {
    for (const id of e.agents) {
      bump(agents, id, e.ts);
      bump(sources, id.split(":")[0], e.ts);
    }
  }
  const byBusiest = <T extends { count: number; lastTs: number }>(a: T & { k: string }, b: T & { k: string }) =>
    b.count - a.count || b.lastTs - a.lastTs || a.k.localeCompare(b.k);

  return {
    windowPrompts: recent.length,
    agents: [...agents.entries()]
      .map(([id, v]) => ({ id, ...v, k: id }))
      .sort(byBusiest)
      .map(({ id, count, lastTs }) => ({ id, count, lastTs })),
    sources: [...sources.entries()]
      .map(([source, v]) => ({ source, ...v, k: source }))
      .sort(byBusiest)
      .map(({ source, count, lastTs }) => ({ source, count, lastTs })),
  };
}

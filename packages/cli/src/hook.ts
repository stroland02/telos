#!/usr/bin/env node
/**
 * Lightweight UserPromptSubmit hook entry — the FAST per-prompt path.
 *
 * This runs on EVERY prompt, so it imports ONLY @telos/harness (engine-free at
 * runtime) and reads a cached product context — it never loads sqlite/tree-sitter/
 * fastify the way the full `telos` CLI does. That cuts the hook from ~1s to ~150ms.
 *
 * stdin: a Claude Code UserPromptSubmit event ({ "prompt": "..." }).
 * stdout: the orchestration plan block (or nothing when no confident match).
 */
import { resolve, join } from "node:path";
import { readConfig, loadRoster, planWorkflow, renderPlan, recordActivity } from "@telos/harness";
import { readProductContextCache } from "./productContextCache.js";

function readStdin(): Promise<string> {
  return new Promise((resolveStdin) => {
    let data = "";
    const stdin = process.stdin;
    if (stdin.isTTY) { resolveStdin(""); return; }
    stdin.setEncoding("utf8");
    // Safety: never hang the prompt — bail after a short wait. `unref()` so the
    // timer NEVER keeps the event loop alive once stdin ends (otherwise the
    // process lingers ~500ms after every prompt).
    const timer = setTimeout(() => resolveStdin(data), 500);
    timer.unref?.();
    stdin.on("data", (c) => { data += c; });
    stdin.on("end", () => { clearTimeout(timer); resolveStdin(data); });
  });
}

async function main(): Promise<void> {
  let prompt = "";
  try { prompt = (JSON.parse(await readStdin()) as { prompt?: string }).prompt ?? ""; }
  catch { return; } // not JSON → emit nothing, never block the prompt
  if (!prompt.trim()) return;

  const cwd = resolve(".");
  const telosDir = join(cwd, ".telos");
  const enabled = readConfig(cwd).enabled;
  const ctx = readProductContextCache(telosDir) ?? { languages: [], layers: [], changedFiles: [] };

  const plan = planWorkflow(prompt, loadRoster({ telosDir }), enabled, ctx);
  const block = renderPlan(plan, ctx);
  if (!block) return;

  console.log(block);
  const agents = plan.steps.flatMap((s) => s.agents.map((a) => a.id));
  recordActivity(telosDir, {
    ts: Date.now(),
    promptSnippet: prompt.slice(0, 120),
    intent: plan.intent,
    agents,
    sources: [...new Set(agents.map((id) => id.split(":")[0]))],
  });
}

main().catch(() => process.exit(0)); // a hook must never fail the prompt

import { Command } from "commander";
import { resolve, join, dirname } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { scan, GraphStore, enrichGraph, heuristicEnricher, createLlmEnricher, buildTour, askGraph, ProcessSample, LANGUAGES_DIR, buildContextPack, renderContextPack, type ContextPack } from "@telos/engine";
import { addLanguage } from "./add-language.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { GraphService, buildServer } from "@telos/server";
import { loadContext, startStdio } from "@telos/mcp";
import { runDoctor, DEFAULT_CATALOG, routePrompt, PROMPT_CATALOG, buildSetupPlan, buildHarnessStatus, HARNESS_INSTALLS, parseLock, type HarnessLock, type HarnessStatus, activate, deactivate, statusLineText, routeForHook, readConfig, setEnabled, ALL_SOURCES, type CapabilitySource } from "@telos/harness";
import { runForge, stubDriver, claudeAgentDriver, ForgeRunResult } from "@telos/forge";
import { runResolve, stubReviewDriver, claudeReviewDriver, type ResolveState } from "@telos/resolve";
import { pathToFileURL } from "node:url";
import open from "open";

export async function runScan(path: string): Promise<{ nodeCount: number; edgeCount: number; dbPath: string }> {
  const { dbPath, graph } = await scan(resolve(path));
  return { nodeCount: graph.nodes.length, edgeCount: graph.edges.length, dbPath };
}

export async function runEnrich(
  path: string,
  opts: { llm?: boolean; model?: string; baseUrl?: string; concurrency?: number } = {},
): Promise<{ enriched: number; dbPath: string; enricher: string }> {
  const dbPath = join(resolve(path), ".telos", "graph.db");
  if (!existsSync(dbPath)) {
    throw new Error(`No graph found at ${dbPath}. Run 'telos scan ${path}' first.`);
  }
  const enricher = opts.llm
    ? createLlmEnricher({ model: opts.model, baseUrl: opts.baseUrl })
    : heuristicEnricher;
  const store = GraphStore.open(dbPath);
  try {
    const enriched = await enrichGraph(store.loadGraph(), enricher, { concurrency: opts.concurrency });
    store.applyEnrichment(enriched.nodes.map((n) => ({ id: n.id, summary: n.summary!, layer: n.layer })));
    return { enriched: enriched.nodes.length, dbPath, enricher: enricher.name };
  } finally {
    store.close();
  }
}

/** Run the scan-for-resolutions pass over a scanned repo; best-effort POST to a server. */
export async function runResolveCli(opts: { path: string; driver: "claude" | "stub"; limit: number; url: string }): Promise<ResolveState> {
  const repo = resolve(opts.path);
  const dbPath = join(repo, ".telos", "graph.db");
  if (!existsSync(dbPath)) {
    throw new Error(`No graph found at ${dbPath}. Run 'telos scan ${opts.path}' first.`);
  }
  const store = GraphStore.open(dbPath);
  let graph;
  try { graph = store.loadGraph(); } finally { store.close(); }
  const driver = opts.driver === "claude" ? claudeReviewDriver : stubReviewDriver;
  const state = await runResolve({ graph, driver, repoDir: repo, limit: opts.limit });
  state.startedAt = Date.now();
  try {
    await fetch(`${opts.url}/v1/resolve`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(state) });
  } catch { /* server not running — findings still returned */ }
  return state;
}

/** Read all of stdin (for hook mode). Resolves "" on a TTY or after a short timeout. */
function readStdin(): Promise<string> {
  return new Promise((res) => {
    if (process.stdin.isTTY) { res(""); return; }
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => { data += c; });
    process.stdin.on("end", () => res(data));
    setTimeout(() => res(data), 250);
  });
}

/** The single-line Telos engagement indicator for the Claude Code statusline. */
export async function runStatusLine(path: string): Promise<string> {
  const repo = resolve(path);
  const graph = existsSync(join(repo, ".telos", "graph.db"));
  let live = false;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 200);
    const res = await fetch("http://127.0.0.1:5180/api/health", { signal: ctrl.signal });
    clearTimeout(t);
    live = res.ok;
  } catch { /* server not running — fine */ }
  const harnesses = readConfig(repo).enabled.length;
  return statusLineText({ agents: DEFAULT_CATALOG.length, graph, live, harnesses: harnesses || undefined });
}

/** Aggregate the harness cockpit status from the repo's lock + the live catalogs. */
export function runHarness(path: string): HarnessStatus {
  const lockPath = join(resolve(path), ".telos", "harness.lock");
  const lock: HarnessLock | null = existsSync(lockPath)
    ? parseLock(readFileSync(lockPath, "utf-8"))
    : null;
  return buildHarnessStatus({
    lockPath,
    lock,
    nodeCatalog: DEFAULT_CATALOG,
    promptCatalog: PROMPT_CATALOG,
    installs: HARNESS_INSTALLS,
  });
}

/** Read the persisted graph and distill it into a token-budgeted context pack —
 *  the agent's warm-start brief. Reflects any enrichment already written to the db. */
export function runContext(path: string, opts: { limit?: number } = {}): ContextPack {
  const dbPath = join(resolve(path), ".telos", "graph.db");
  if (!existsSync(dbPath)) {
    throw new Error(`No graph found at ${dbPath}. Run 'telos scan ${path}' first.`);
  }
  const store = GraphStore.open(dbPath);
  try {
    return buildContextPack(store.loadGraph(), { limit: opts.limit });
  } finally {
    store.close();
  }
}

/** Build a small synthetic OTLP/HTTP JSON payload whose span names map to the
 *  given qualifiedNames (root → children), with one error span, so the live
 *  overlay lights up without instrumenting a real app. */
export function buildDemoOtlp(names: string[]): { resourceSpans: unknown[] } {
  const [root, ...children] = names;
  const spans: unknown[] = [{
    traceId: "demo0000000000000000000000000001", spanId: "demaa00000000001",
    name: root, startTimeUnixNano: "1000000", endTimeUnixNano: "26000000", // 25ms
    attributes: [{ key: "code.function", value: { stringValue: root.split(/[.:]/).pop() } }],
  }];
  children.forEach((n, i) => {
    spans.push({
      traceId: "demo0000000000000000000000000001", spanId: `demab0000000000${i + 1}`,
      parentSpanId: "demaa00000000001", name: n,
      startTimeUnixNano: "2000000", endTimeUnixNano: `${(i + 2) * 3}000000`,
      status: i === 0 ? { code: 2 } : undefined, // first child errors
      attributes: [{ key: "code.function", value: { stringValue: n.split(/[.:]/).pop() } }],
    });
  });
  return { resourceSpans: [{ scopeSpans: [{ spans }] }] };
}

/** Synthetic OTLP/HTTP JSON logs whose code.* attrs map to the given names. */
export function buildDemoLogs(names: string[]): { resourceLogs: unknown[] } {
  const sev = ["INFO", "ERROR", "WARN"];
  // code.function carries the full qualifiedName so the matcher (which has no
  // name fallback for logs) resolves the record to a real node.
  const logRecords = names.slice(0, 3).map((n, i) => ({
    timeUnixNano: `${(i + 1) * 1000000}`,
    severityText: sev[i % sev.length],
    body: { stringValue: `${sev[i % sev.length]} from ${n}` },
    attributes: [{ key: "code.function", value: { stringValue: n } }],
  }));
  return { resourceLogs: [{ scopeLogs: [{ logRecords }] }] };
}

/** Synthetic OTLP/HTTP JSON metrics (gauge points) whose code.* attrs map to nodes. */
export function buildDemoMetrics(names: string[]): { resourceMetrics: unknown[] } {
  const metrics = names.slice(0, 3).map((n, i) => ({
    name: i === 0 ? "latency_ms" : i === 1 ? "calls_total" : "errors_total",
    unit: i === 0 ? "ms" : "1",
    gauge: { dataPoints: [
      { timeUnixNano: "1000000", asDouble: (i + 1) * 7, attributes: [{ key: "code.function", value: { stringValue: n } }] },
      { timeUnixNano: "2000000", asDouble: (i + 1) * 11, attributes: [{ key: "code.function", value: { stringValue: n } }] },
    ] },
  }));
  return { resourceMetrics: [{ scopeMetrics: [{ metrics }] }] };
}

/** Synthetic folded/collapsed stacks whose frames are real qualifiedNames. */
export function buildDemoProfile(names: string[]): string {
  const [root, ...rest] = names;
  const lines = rest.slice(0, 3).map((n, i) => `${root};${n} ${(i + 2) * 4}`);
  lines.push(`${root} 3`);
  return lines.join("\n");
}

export async function runTraceDemo(
  opts: { url?: string; path?: string; fetchImpl?: typeof fetch } = {},
): Promise<{ spans: number; logs: number; metrics: number; profileLines: number; url: string }> {
  const url = (opts.url ?? "http://localhost:5180").replace(/\/$/, "");
  const doFetch = opts.fetchImpl ?? fetch;
  // Prefer real qualifiedNames from the scanned graph so demo traffic lands on
  // actual nodes; fall back to placeholders when no graph is present.
  let names: string[] = [];
  const dbPath = join(resolve(opts.path ?? "."), ".telos", "graph.db");
  if (existsSync(dbPath)) {
    const store = GraphStore.open(dbPath);
    try {
      names = store.loadGraph().nodes
        .filter((n) => n.kind === "function" || n.kind === "method")
        .slice(0, 5).map((n) => n.qualifiedName);
    } finally { store.close(); }
  }
  if (names.length < 2) names = ["app.main", "app.handleRequest", "db.query"];
  const body = buildDemoOtlp(names);
  const spans = (body.resourceSpans[0] as { scopeSpans: { spans: unknown[] }[] }).scopeSpans[0].spans.length;
  const res = await doFetch(`${url}/v1/traces`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`trace demo POST failed: ${res.status}`);

  const logsBody = buildDemoLogs(names);
  const logs = (logsBody.resourceLogs[0] as { scopeLogs: { logRecords: unknown[] }[] }).scopeLogs[0].logRecords.length;
  const logRes = await doFetch(`${url}/v1/logs`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(logsBody),
  });
  if (!logRes.ok) throw new Error(`logs demo POST failed: ${logRes.status}`);

  const metricsBody = buildDemoMetrics(names);
  const metrics = (metricsBody.resourceMetrics[0] as { scopeMetrics: { metrics: unknown[] }[] }).scopeMetrics[0].metrics.length;
  const metricRes = await doFetch(`${url}/v1/metrics`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(metricsBody),
  });
  if (!metricRes.ok) throw new Error(`metrics demo POST failed: ${metricRes.status}`);

  const folded = buildDemoProfile(names);
  const profileLines = folded.split("\n").length;
  const profRes = await doFetch(`${url}/v1/profile`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ folded }),
  });
  if (!profRes.ok) throw new Error(`profile demo POST failed: ${profRes.status}`);

  return { spans, logs, metrics, profileLines, url };
}

const pexecFile = promisify(execFile);

/** Enumerate local processes via the OS. Windows uses Win32_Process (gives the
 *  command line, which powers the node join); unix uses ps. CPU% is best-effort
 *  (0 on Windows where it needs sampling). */
// Windows: join Win32_Process (pid/name/cmd/mem/ppid) with the perf-counter
// class (instantaneous CPU%, normalized by logical core count) by PID.
const WIN_PROC_SCRIPT = `
$cpu = @{}
Get-CimInstance Win32_PerfFormattedData_PerfProc_Process | ForEach-Object { $cpu[[int]$_.IDProcess] = [int]$_.PercentProcessorTime }
$cores = [Math]::Max(1, (Get-CimInstance Win32_ComputerSystem).NumberOfLogicalProcessors)
Get-CimInstance Win32_Process | ForEach-Object {
  [pscustomobject]@{ pid=$_.ProcessId; ppid=$_.ParentProcessId; name=$_.Name; cmd=$_.CommandLine; mem=$_.WorkingSetSize; cpu=[Math]::Round((($cpu[[int]$_.ProcessId]) / $cores),1) }
} | ConvertTo-Json -Compress
`.trim();

export async function collectProcesses(): Promise<ProcessSample[]> {
  if (process.platform === "win32") {
    const { stdout } = await pexecFile("powershell", ["-NoProfile", "-Command", WIN_PROC_SCRIPT], { maxBuffer: 32 * 1024 * 1024 });
    const raw = JSON.parse(stdout);
    const arr = Array.isArray(raw) ? raw : [raw];
    return arr.map((p: { pid?: number; ppid?: number; name?: string; cmd?: string; mem?: number; cpu?: number }) => ({
      pid: Number(p.pid ?? 0), ppid: p.ppid != null ? Number(p.ppid) : undefined,
      name: String(p.name ?? ""), cmd: p.cmd ?? "",
      cpu: Number(p.cpu ?? 0), memMb: Number(p.mem ?? 0) / 1048576,
    })).filter((p) => p.pid > 0);
  }
  const { stdout } = await pexecFile("ps", ["-axo", "pid=,ppid=,%cpu=,rss=,comm=,args="], { maxBuffer: 32 * 1024 * 1024 });
  return stdout.split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
    const m = line.match(/^(\d+)\s+(\d+)\s+([\d.]+)\s+(\d+)\s+(\S+)\s+(.*)$/);
    if (!m) return null;
    return { pid: Number(m[1]), ppid: Number(m[2]), cpu: Number(m[3]), memMb: Number(m[4]) / 1024, name: m[5], cmd: m[6] } as ProcessSample;
  }).filter((p): p is ProcessSample => p !== null);
}

/** Synthetic processes whose cmd references real file paths (so they tag to nodes). */
export function buildDemoProcesses(paths: string[]): ProcessSample[] {
  // A small hierarchy: a shell spawns node, which spawns a worker + telos serve.
  const out: ProcessSample[] = [
    { pid: 1000, name: "pwsh", cmd: "pwsh", cpu: 0.4, memMb: 60 },
    { pid: 9001, name: "chrome", cmd: "chrome.exe", cpu: 28.4, memMb: 720 },
    { pid: 4242, ppid: 1000, name: "node", cmd: `node ${paths[0] ?? "app.js"} --watch`, cpu: 14.2, memMb: 210 },
    { pid: 5310, ppid: 4242, name: "telos", cmd: "node telos serve", cpu: 2.1, memMb: 90 },
  ];
  if (paths[1]) out.push({ pid: 7777, ppid: 4242, name: "worker", cmd: `node ${paths[1]}`, cpu: 6.0, memMb: 140 });
  return out;
}

export async function runTop(opts: {
  url?: string; path?: string; demo?: boolean;
  fetchImpl?: typeof fetch; collectImpl?: () => Promise<ProcessSample[]>;
} = {}): Promise<{ count: number; url: string }> {
  const url = (opts.url ?? "http://localhost:5180").replace(/\/$/, "");
  const doFetch = opts.fetchImpl ?? fetch;
  let processes: ProcessSample[];
  if (opts.demo) {
    let paths: string[] = [];
    const dbPath = join(resolve(opts.path ?? "."), ".telos", "graph.db");
    if (existsSync(dbPath)) {
      const store = GraphStore.open(dbPath);
      try { paths = store.loadGraph().nodes.filter((n) => n.kind === "file").slice(0, 3).map((n) => n.path); } finally { store.close(); }
    }
    processes = buildDemoProcesses(paths);
  } else {
    processes = await (opts.collectImpl ?? collectProcesses)();
  }
  const res = await doFetch(`${url}/v1/processes`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ processes }),
  });
  if (!res.ok) throw new Error(`processes POST failed: ${res.status}`);
  return { count: processes.length, url };
}

export async function runForgeCli(opts: {
  intent: string; path?: string; url?: string; driver?: string;
  budget?: number; maxTurns?: number; fetchImpl?: typeof fetch;
}): Promise<ForgeRunResult> {
  const repoDir = resolve(opts.path ?? ".");
  const url = (opts.url ?? "http://localhost:5180").replace(/\/$/, "");
  const doFetch = opts.fetchImpl ?? fetch;
  const driver = opts.driver === "stub" ? stubDriver : claudeAgentDriver;
  const run = `forge-${driver.id}`;
  return runForge({
    intent: opts.intent, repoDir, driver,
    maxBudgetUsd: opts.budget, maxTurns: opts.maxTurns,
    onDiff: async ({ checkpoint, diff }) => {
      try {
        await doFetch(`${url}/v1/forge/diff`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ run, checkpoint, diff }),
        });
      } catch { /* headless / no server — reflection is best-effort */ }
    },
  });
}

export async function runServe(opts: { path: string; port: number; open?: boolean }): Promise<{ address: string; close: () => Promise<void> }> {
  const repo = resolve(opts.path);
  const dbPath = join(repo, ".telos", "graph.db");
  if (!existsSync(dbPath)) {
    throw new Error(`No graph found at ${dbPath}. Run 'telos scan ${opts.path}' first.`);
  }
  // packages/cli/dist/main.js -> ../../../apps/web/dist
  const here = dirname(fileURLToPath(import.meta.url));
  const webDist = resolve(here, "..", "..", "..", "apps", "web", "dist");
  const service = GraphService.fromDb(dbPath, repo);
  const app = buildServer(service, existsSync(webDist) ? { staticDir: webDist } : {});
  const address = await app.listen({ port: opts.port, host: "127.0.0.1" });
  if (opts.open) await open(address);
  return { address, close: async () => { await app.close(); service.close(); } };
}

export function buildProgram(): Command {
  const program = new Command();
  program.name("telos").description("Telos, the Code Sentinel");
  program.command("scan <path>").description("Scan a codebase into a graph")
    .action(async (path: string) => {
      const s = await runScan(path);
      console.log(`Telos: ${s.nodeCount} nodes, ${s.edgeCount} edges -> ${s.dbPath}`);
    });
  program.command("add-language <id>").description("Scaffold a new language mapping (adds a discoverable languages/<id>/ folder)")
    .requiredOption("--ext <exts>", "comma-separated file extensions, e.g. .rb,.rake")
    .option("--grammar <wasm>", "grammar wasm filename (default tree-sitter-<id>.wasm)")
    .option("--alias-of <id>", "reuse another language's extract.scm instead of authoring one")
    .option("--dir <path>", "target languages dir (default: the engine's languages/)")
    .action((id: string, opts: { ext: string; grammar?: string; aliasOf?: string; dir?: string }) => {
      const extensions = opts.ext.split(",").map((e) => e.trim()).filter(Boolean)
        .map((e) => (e.startsWith(".") ? e : "." + e));
      const dir = opts.dir ? resolve(opts.dir) : LANGUAGES_DIR;
      const grammar = opts.grammar ?? `tree-sitter-${id}.wasm`;
      const res = addLanguage({ id, extensions, grammar: opts.grammar, aliasOf: opts.aliasOf, dir });
      console.log(`Created ${id}:`);
      for (const f of res.created) console.log(`  ${f}`);
      console.log("\nNext steps:");
      console.log(`  1. Drop ${grammar} into packages/engine/grammars/`);
      if (opts.aliasOf) {
        console.log(`  2. Re-scan — ${id} reuses ${opts.aliasOf}'s query and is auto-discovered`);
      } else {
        console.log(`  2. Fill in ${join(res.folder, "extract.scm")} with the universal-kind queries`);
        console.log(`  3. Re-scan — ${id} is now auto-discovered`);
      }
    });
  program.command("context [path]").description("Print a token-budgeted architecture brief for agents (graph-as-memory)")
    .option("--limit <n>", "max items per section", "12")
    .option("--json", "emit the raw ContextPack JSON instead of markdown", false)
    .action((path: string | undefined, opts: { limit: string; json: boolean }) => {
      const pack = runContext(path ?? ".", { limit: Number(opts.limit) });
      console.log(opts.json ? JSON.stringify(pack, null, 2) : renderContextPack(pack));
    });
  program.command("harness [path]").description("Show the harness cockpit; --enable/--disable selects which harnesses are active (autopilot)")
    .option("--json", "emit the raw HarnessStatus JSON", false)
    .option("--enable <list>", "comma-separated harnesses to turn on (ecc,superpowers,headroom)")
    .option("--disable <list>", "comma-separated harnesses to turn off")
    .action((path: string | undefined, opts: { json: boolean; enable?: string; disable?: string }) => {
      const repo = resolve(path ?? ".");
      const parse = (s?: string) => (s ?? "").split(",").map((x) => x.trim()).filter((x): x is CapabilitySource => (ALL_SOURCES as string[]).includes(x));
      let changed = false;
      for (const s of parse(opts.enable)) { setEnabled(repo, s, true); changed = true; }
      for (const s of parse(opts.disable)) { setEnabled(repo, s, false); changed = true; }
      if (changed) {
        const enabled = readConfig(repo).enabled;
        console.log(`Active harnesses: ${enabled.length ? enabled.join(", ") : "(none)"}`);
        const missing = HARNESS_INSTALLS.filter((h) => enabled.includes(h.source));
        if (missing.length) {
          console.log("\nEnsure each selected harness is installed + enabled in Claude Code:");
          for (const h of missing) console.log(`  ${h.source.padEnd(12)} ${h.install.join(" && ")}`);
        }
        console.log("\nTelos will route each prompt to these harnesses' capabilities (re-activate if not engaged: telos activate).");
        return;
      }
      const status = runHarness(path ?? ".");
      if (opts.json) { console.log(JSON.stringify(status, null, 2)); return; }
      console.log("Harnesses (orchestrate + curate):");
      for (const h of status.installed) {
        console.log(`  ${h.source.padEnd(12)} ${String(h.nodeCapabilities).padStart(3)} caps  ${h.title}`);
      }
      console.log(`\nCapabilities: ${status.totals.nodeCapabilities} node-context, ${status.totals.promptIntents} prompt intents`);
      const lock = status.lock.present ? "present" : "absent (run 'telos doctor' to bootstrap)";
      console.log(`Lock: ${lock}`);
      if (status.drift.status === "drift") {
        console.log(`Drift: ${status.drift.missing.length} missing, ${status.drift.added.length} new — run 'telos doctor'`);
      } else {
        console.log("Drift: ok");
      }
    });
  program.command("activate [path]").description("Engage Telos: bootstrap the harness + show '◇ Telos engaged' in the Claude Code statusline")
    .action((path: string | undefined) => {
      const repo = resolve(path ?? ".");
      const selfPath = fileURLToPath(import.meta.url);
      const st = activate(repo, {
        statusLineCommand: `node "${selfPath}" status --line`,
        hookCommand: `node "${selfPath}" route --hook`,
      });
      runDoctor(join(repo, ".telos", "harness.lock"));
      console.log(`◇ Telos engaged — statusline + per-prompt routing hook written to ${st.settingsPath}`);
      console.log("Open a Claude Code session in this repo to see: ◇ Telos engaged");
      console.log("\nHarnesses (install + enable any you want, then 'telos harness --enable <list>'):");
      for (const h of buildSetupPlan()) console.log(`  ${h.source.padEnd(12)} ${h.install.join(" && ")}`);
      console.log("\nUndo with: telos deactivate");
    });
  program.command("deactivate [path]").description("Remove the Telos statusline from this repo")
    .action((path: string | undefined) => {
      const st = deactivate(resolve(path ?? "."));
      console.log(st.statusLinePresent ? "Telos statusline still present." : `Telos statusline removed from ${st.settingsPath}.`);
    });
  program.command("status [path]").description("Print the Telos engagement status line")
    .option("--line", "print a single line (used by the Claude Code statusline)", false)
    .action(async (path: string | undefined) => {
      console.log(await runStatusLine(path ?? "."));
    });
  program.command("resolve [path]").description("Scan for resolutions: run review agents over the riskiest nodes, flag findings on the map")
    .option("--driver <id>", "review driver: claude | stub", "stub")
    .option("--limit <n>", "max nodes to review", "20")
    .option("--url <url>", "Telos server to post findings to", "http://127.0.0.1:5180")
    .action(async (path: string | undefined, opts: { driver: string; limit: string; url: string }) => {
      const state = await runResolveCli({ path: path ?? ".", driver: opts.driver === "claude" ? "claude" : "stub", limit: Number(opts.limit), url: opts.url });
      console.log(`Reviewed ${state.scanned} nodes — ${state.findings.length} findings.`);
      for (const f of state.findings.slice(0, 20)) console.log(`  [${f.severity}] ${f.title} — ${f.file}`);
    });
  program.command("serve [path]").description("Serve the architecture map for a scanned repo")
    .option("-p, --port <port>", "port to listen on", "5180")
    .option("--open", "open the map in your browser", false)
    .action(async (path: string | undefined, opts: { port: string; open: boolean }) => {
      const { address } = await runServe({ path: path ?? ".", port: Number(opts.port), open: opts.open });
      console.log(`Telos serving the architecture map at ${address}`);
    });
  program.command("mcp").description("Serve the Telos graph to AI agents over MCP (stdio)")
    .option("--db <path>", "path to graph.db", ".telos/graph.db")
    .action(async (opts: { db: string }) => {
      try {
        const ctx = loadContext(resolve(process.cwd(), opts.db));
        await startStdio(ctx);
      } catch (err) {
        console.error(err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });
  program.command("enrich [path]").description("Fill node summaries (heuristic by default; --llm for a local model)")
    .option("--llm", "use a local OpenAI-compatible model (e.g. Ollama)", false)
    .option("--model <name>", "model id", "qwen2.5-coder:7b")
    .option("--base-url <url>", "OpenAI-compatible base URL", "http://localhost:11434/v1")
    .option("-c, --concurrency <n>", "parallel enrichment requests", "8")
    .action(async (path: string | undefined, opts: { llm: boolean; model: string; baseUrl: string; concurrency: string }) => {
      const r = await runEnrich(path ?? ".", {
        llm: opts.llm, model: opts.model, baseUrl: opts.baseUrl, concurrency: Number(opts.concurrency),
      });
      console.log(`Telos: enriched ${r.enriched} nodes via ${r.enricher} -> ${r.dbPath}`);
    });
  program.command("tour [path]").description("Print a dependency-ordered walkthrough of the codebase")
    .option("-n, --limit <n>", "max stops", "20")
    .action(async (path: string | undefined, opts: { limit: string }) => {
      const dbPath = join(resolve(path ?? "."), ".telos", "graph.db");
      if (!existsSync(dbPath)) throw new Error(`No graph at ${dbPath}. Run 'telos scan' first.`);
      const store = GraphStore.open(dbPath);
      try {
        const tour = buildTour(store.loadGraph(), { limit: Number(opts.limit) });
        for (const s of tour) console.log(`${s.order + 1}. ${s.node.qualifiedName}  ${s.node.summary ?? ""}`.trimEnd());
      } finally { store.close(); }
    });
  program.command("ask <question>").description("Ask where something happens in the codebase (deterministic; no LLM)")
    .option("-p, --path <path>", "repo path", ".")
    .option("-n, --limit <n>", "max answers", "10")
    .action(async (question: string, opts: { path: string; limit: string }) => {
      const dbPath = join(resolve(opts.path), ".telos", "graph.db");
      if (!existsSync(dbPath)) throw new Error(`No graph at ${dbPath}. Run 'telos scan' first.`);
      const store = GraphStore.open(dbPath);
      try {
        const answers = askGraph(store.loadGraph(), question, { limit: Number(opts.limit) });
        if (answers.length === 0) { console.log("No matching code found."); return; }
        for (const a of answers) console.log(`${a.node.qualifiedName}  (${a.node.path})  ${a.node.summary ?? ""}`.trimEnd());
      } finally { store.close(); }
    });
  program.command("trace").description("Emit synthetic OTel traffic to a running server (demo the live overlay)")
    .option("--demo", "send a synthetic OTLP trace", false)
    .option("--url <url>", "running Telos server base URL", "http://localhost:5180")
    .option("-p, --path <path>", "repo path (to map demo spans onto real nodes)", ".")
    .action(async (opts: { demo: boolean; url: string; path: string }) => {
      if (!opts.demo) { console.log("Nothing to do. Use `telos trace --demo` to emit synthetic traffic."); return; }
      const r = await runTraceDemo({ url: opts.url, path: opts.path });
      console.log(`Telos: emitted ${r.spans} spans + ${r.logs} logs + ${r.metrics} metrics + ${r.profileLines} profile stacks -> ${r.url} (toggle "● Live", "▷ Replay", "🔥 Hot", or open a node)`);
    });
  program.command("top").description("Push a local process snapshot to a running server (process overlay)")
    .option("--demo", "push synthetic processes instead of enumerating the OS", false)
    .option("--url <url>", "running Telos server base URL", "http://localhost:5180")
    .option("-p, --path <path>", "repo path (to map demo processes onto real files)", ".")
    .action(async (opts: { demo: boolean; url: string; path: string }) => {
      const r = await runTop({ url: opts.url, path: opts.path, demo: opts.demo });
      console.log(`Telos: pushed ${r.count} processes -> ${r.url}/v1/processes (open "▤ Procs" in the map)`);
    });
  program.command("forge <intent>").description("Run a bounded agentic build loop on an isolated branch (reflects onto the map)")
    .option("-p, --path <path>", "repo path", ".")
    .option("--url <url>", "running Telos server base URL", "http://localhost:5180")
    .option("--driver <id>", "build driver: claude-agent | stub", "claude-agent")
    .option("--budget <usd>", "max spend before stopping", parseFloat)
    .option("--max-turns <n>", "max agent turns", (v) => parseInt(v, 10))
    .action(async (intent: string, opts: { path: string; url: string; driver: string; budget?: number; maxTurns?: number }) => {
      const r = await runForgeCli({ intent, path: opts.path, url: opts.url, driver: opts.driver, budget: opts.budget, maxTurns: opts.maxTurns });
      console.log(`Telos forge [${r.stop}] — branch ${r.branch}: ${r.commits} commit(s), ${r.turns} turn(s), $${r.costUsd.toFixed(4)}.`);
      console.log(`Review: git diff ${r.baseBranch}..${r.branch}  (merge to keep, or 'git branch -D ${r.branch}' to discard)`);
    });
  program.command("setup").description("Print harness install commands (ECC/Superpowers/Headroom) and bootstrap .telos/harness.lock")
    .option("--dir <path>", "project dir containing .telos", ".")
    .action((opts: { dir: string }) => {
      console.log("Telos harness fusion — install these (Telos won't run them for you):\n");
      for (const h of buildSetupPlan()) {
        console.log(`# ${h.title}  (${h.license}) — ${h.repo}`);
        for (const cmd of h.install) console.log(`  ${cmd}`);
        console.log("");
      }
      const lockPath = resolve(process.cwd(), opts.dir, ".telos", "harness.lock");
      const { initialized } = runDoctor(lockPath);
      console.log(initialized ? `Bootstrapped ${lockPath}.` : `Harness lock already present at ${lockPath}.`);
      console.log("Run `telos doctor` anytime to check for capability drift.");
    });
  program.command("doctor").description("Check the harness for capability drift (and bootstrap .telos/harness.lock)")
    .option("--dir <path>", "project dir containing .telos", ".")
    .action((opts: { dir: string }) => {
      const lockPath = resolve(process.cwd(), opts.dir, ".telos", "harness.lock");
      const { initialized, report } = runDoctor(lockPath);
      if (initialized) {
        console.log(`Initialized ${lockPath} with ${DEFAULT_CATALOG.length} pinned capabilities.`);
        return;
      }
      if (report.status === "ok") {
        console.log(`Harness OK — no capability drift (${DEFAULT_CATALOG.length} capabilities).`);
        return;
      }
      console.warn("Harness drift detected (recommendations for affected capabilities are hidden, nothing is broken):");
      if (report.missing.length) console.warn(`  removed/renamed (pinned but gone): ${report.missing.join(", ")}`);
      if (report.added.length) console.warn(`  new (not yet pinned): ${report.added.join(", ")}`);
    });
  program.command("route [prompt]").description("Suggest harness capabilities for a prompt; --hook reads a UserPromptSubmit event from stdin and prints a routing nudge")
    .option("--hook", "act as a Claude Code UserPromptSubmit hook (stdin JSON in, one-line nudge out)", false)
    .action(async (prompt: string | undefined, opts: { hook: boolean }) => {
      if (opts.hook) {
        let userPrompt = "";
        try { userPrompt = (JSON.parse(await readStdin()) as { prompt?: string }).prompt ?? ""; } catch { /* not JSON — emit nothing */ }
        const line = routeForHook(userPrompt, readConfig(resolve(".")).enabled);
        if (line) console.log(line); // injected as context for this prompt
        return;
      }
      if (!prompt) { console.log("Provide a prompt, or use --hook for stdin mode."); return; }
      const routed = routePrompt(prompt, PROMPT_CATALOG);
      if (routed.length === 0) { console.log("No harness capability matched this prompt."); return; }
      console.log("Suggested capabilities:");
      for (const r of routed) console.log(`  ${r.capability.id} — ${r.capability.title}  (score ${r.score})`);
    });
  return program;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  buildProgram().parseAsync(process.argv).catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}

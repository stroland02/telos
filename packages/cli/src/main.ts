import { Command } from "commander";
import { resolve, join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { scan, GraphStore, enrichGraph, heuristicEnricher, createLlmEnricher, buildTour, askGraph } from "@telos/engine";
import { GraphService, buildServer } from "@telos/server";
import { loadContext, startStdio } from "@telos/mcp";
import { runDoctor, DEFAULT_CATALOG, routePrompt, PROMPT_CATALOG, buildSetupPlan } from "@telos/harness";
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
  program.command("route <prompt>").description("Suggest harness capabilities for a prompt (authoring mode)")
    .action((prompt: string) => {
      const routed = routePrompt(prompt, PROMPT_CATALOG);
      if (routed.length === 0) {
        console.log("No harness capability matched this prompt.");
        return;
      }
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

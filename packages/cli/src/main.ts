import { Command } from "commander";
import { resolve, join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { scan, GraphStore, enrichGraph, heuristicEnricher, buildTour, askGraph } from "@telos/engine";
import { GraphService, buildServer } from "@telos/server";
import { loadContext, startStdio } from "@telos/mcp";
import { runDoctor, DEFAULT_CATALOG, routePrompt, PROMPT_CATALOG, buildSetupPlan } from "@telos/harness";
import { pathToFileURL } from "node:url";
import open from "open";

export async function runScan(path: string): Promise<{ nodeCount: number; edgeCount: number; dbPath: string }> {
  const { dbPath, graph } = await scan(resolve(path));
  return { nodeCount: graph.nodes.length, edgeCount: graph.edges.length, dbPath };
}

export async function runEnrich(path: string): Promise<{ enriched: number; dbPath: string }> {
  const dbPath = join(resolve(path), ".telos", "graph.db");
  if (!existsSync(dbPath)) {
    throw new Error(`No graph found at ${dbPath}. Run 'telos scan ${path}' first.`);
  }
  const store = GraphStore.open(dbPath);
  try {
    const enriched = await enrichGraph(store.loadGraph(), heuristicEnricher);
    store.applyEnrichment(enriched.nodes.map((n) => ({ id: n.id, summary: n.summary!, layer: n.layer })));
    return { enriched: enriched.nodes.length, dbPath };
  } finally {
    store.close();
  }
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
  program.command("enrich [path]").description("Fill node summaries from the graph (deterministic; no LLM)")
    .action(async (path: string | undefined) => {
      const r = await runEnrich(path ?? ".");
      console.log(`Telos: enriched ${r.enriched} nodes -> ${r.dbPath}`);
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

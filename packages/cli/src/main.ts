import { Command } from "commander";
import { resolve, join } from "node:path";
import { existsSync } from "node:fs";
import { scan } from "@telos/engine";
import { GraphService, buildServer } from "@telos/server";
import { pathToFileURL } from "node:url";

export async function runScan(path: string): Promise<{ nodeCount: number; edgeCount: number; dbPath: string }> {
  const { dbPath, graph } = await scan(resolve(path));
  return { nodeCount: graph.nodes.length, edgeCount: graph.edges.length, dbPath };
}

export async function runServe(opts: { path: string; port: number }): Promise<{ address: string; close: () => Promise<void> }> {
  const repo = resolve(opts.path);
  const dbPath = join(repo, ".telos", "graph.db");
  if (!existsSync(dbPath)) {
    throw new Error(`No graph found at ${dbPath}. Run 'telos scan ${opts.path}' first.`);
  }
  const service = GraphService.fromDb(dbPath);
  const app = buildServer(service);
  const address = await app.listen({ port: opts.port, host: "127.0.0.1" });
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
  program.command("serve [path]").description("Serve the architecture API for a scanned repo")
    .option("-p, --port <port>", "port to listen on", "5180")
    .action(async (path: string | undefined, opts: { port: string }) => {
      const { address } = await runServe({ path: path ?? ".", port: Number(opts.port) });
      console.log(`Telos serving the architecture API at ${address}`);
    });
  return program;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  buildProgram().parseAsync(process.argv).catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}

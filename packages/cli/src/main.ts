import { Command } from "commander";
import { resolve } from "node:path";
import { scan } from "@telos/engine";
import { pathToFileURL } from "node:url";

export async function runScan(path: string): Promise<{ nodeCount: number; edgeCount: number; dbPath: string }> {
  const { dbPath, graph } = await scan(resolve(path));
  return { nodeCount: graph.nodes.length, edgeCount: graph.edges.length, dbPath };
}

export function buildProgram(): Command {
  const program = new Command();
  program.name("telos").description("Telos, the Code Sentinel");
  program.command("scan <path>").description("Scan a codebase into a graph")
    .action(async (path: string) => {
      const s = await runScan(path);
      console.log(`Telos: ${s.nodeCount} nodes, ${s.edgeCount} edges -> ${s.dbPath}`);
    });
  return program;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  buildProgram().parseAsync(process.argv);
}

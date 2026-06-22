import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ToolContext, runExplore, runCallers, runCallees, runImpact, runAffected } from "./tools.js";

const asText = (result: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
});

export function buildMcpServer(ctx: ToolContext): McpServer {
  const server = new McpServer({ name: "telos", version: "0.1.0" });

  server.registerTool(
    "telos_explore",
    {
      description: "Structural answer for a query: matching symbols with callers, callees, impact.",
      inputSchema: { query: z.string(), limit: z.number().optional() },
    },
    async (args) => asText(runExplore(ctx, args)),
  );

  server.registerTool(
    "telos_callers",
    {
      description: "Direct callers of a symbol (by id, qualified name, or name).",
      inputSchema: { symbol: z.string() },
    },
    async (args) => asText(runCallers(ctx, args)),
  );

  server.registerTool(
    "telos_callees",
    {
      description: "Direct callees of a symbol.",
      inputSchema: { symbol: z.string() },
    },
    async (args) => asText(runCallees(ctx, args)),
  );

  server.registerTool(
    "telos_impact",
    {
      description: "Transitive blast radius: everything that depends on a symbol.",
      inputSchema: { symbol: z.string() },
    },
    async (args) => asText(runImpact(ctx, args)),
  );

  server.registerTool(
    "telos_affected",
    {
      description: "Symbols and files impacted by a set of changed paths.",
      inputSchema: { paths: z.array(z.string()) },
    },
    async (args) => asText(runAffected(ctx, args)),
  );

  return server;
}

export async function startStdio(ctx: ToolContext): Promise<void> {
  const server = buildMcpServer(ctx);
  await server.connect(new StdioServerTransport());
}

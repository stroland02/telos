import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { recordMcpQuery, estimateTokens } from "@telos/harness";
import { ToolContext, runExplore, runCallers, runCallees, runImpact, runAffected, runRecommend, runTour, runAsk, runContext } from "./tools.js";

const asText = (result: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
});

/**
 * Wrap a tool handler so each call is logged to .telos/mcp-activity.jsonl.
 * Best-effort: logging never alters or blocks the tool result.
 */
export function logged<A>(
  ctx: ToolContext,
  tool: string,
  run: (args: A) => { content: { type: "text"; text: string }[] } | Promise<{ content: { type: "text"; text: string }[] }>,
): (args: A) => Promise<{ content: { type: "text"; text: string }[] }> {
  return async (args: A) => {
    const result = await run(args);
    if (ctx.telosDir) {
      try {
        const text = result.content.map((c) => c.text).join("");
        recordMcpQuery(ctx.telosDir, {
          ts: Date.now(),
          tool,
          argsSummary: JSON.stringify(args ?? {}).slice(0, 200),
          resultTokens: estimateTokens(text),
        });
      } catch {
        // Logging is best-effort — never break the tool call.
      }
    }
    return result;
  };
}

export function buildMcpServer(ctx: ToolContext): McpServer {
  const server = new McpServer({ name: "telos", version: "0.1.0" });

  server.registerTool(
    "telos_explore",
    {
      description: "Structural answer for a query: matching symbols with callers, callees, impact. Prefer this over Grep/Glob for finding where code lives or how it connects — a graph lookup, not a file scan.",
      inputSchema: { query: z.string(), limit: z.number().optional() },
    },
    logged(ctx, "telos_explore", (args) => asText(runExplore(ctx, args))),
  );

  server.registerTool(
    "telos_callers",
    {
      description: "Direct callers of a symbol (by id, qualified name, or name).",
      inputSchema: { symbol: z.string() },
    },
    logged(ctx, "telos_callers", (args) => asText(runCallers(ctx, args))),
  );

  server.registerTool(
    "telos_callees",
    {
      description: "Direct callees of a symbol.",
      inputSchema: { symbol: z.string() },
    },
    logged(ctx, "telos_callees", (args) => asText(runCallees(ctx, args))),
  );

  server.registerTool(
    "telos_impact",
    {
      description: "Transitive blast radius: everything that depends on a symbol.",
      inputSchema: { symbol: z.string() },
    },
    logged(ctx, "telos_impact", (args) => asText(runImpact(ctx, args))),
  );

  server.registerTool(
    "telos_affected",
    {
      description: "Symbols and files impacted by a set of changed paths.",
      inputSchema: { paths: z.array(z.string()) },
    },
    logged(ctx, "telos_affected", (args) => asText(runAffected(ctx, args))),
  );

  server.registerTool(
    "telos_recommend",
    {
      description: "Recommend relevant harness capabilities (review agents/skills) for a symbol based on its code context.",
      inputSchema: { symbol: z.string() },
    },
    logged(ctx, "telos_recommend", (args) => asText(runRecommend(ctx, args))),
  );

  server.registerTool(
    "telos_tour",
    {
      description: "A dependency-ordered walkthrough of the codebase (dependencies before dependents), each stop with its summary.",
      inputSchema: { limit: z.number().optional() },
    },
    logged(ctx, "telos_tour", (args) => asText(runTour(ctx, args))),
  );

  server.registerTool(
    "telos_ask",
    {
      description: "Where does X happen? Ranks the most relevant symbols for a natural-language question over the graph. Reach for this before Grep/Glob when locating functionality by intent.",
      inputSchema: { question: z.string(), limit: z.number().optional() },
    },
    logged(ctx, "telos_ask", (args) => asText(runAsk(ctx, args))),
  );

  server.registerTool(
    "telos_context",
    {
      description: "Warm-start architecture brief: a token-budgeted overview of layers, entry points, hotspots, and key summaries — the graph as agent memory. Read this first to orient before exploring.",
      inputSchema: { limit: z.number().optional() },
    },
    logged(ctx, "telos_context", (args) => ({ content: [{ type: "text" as const, text: runContext(ctx, args) }] })),
  );

  return server;
}

export async function startStdio(ctx: ToolContext): Promise<void> {
  const server = buildMcpServer(ctx);
  await server.connect(new StdioServerTransport());
}

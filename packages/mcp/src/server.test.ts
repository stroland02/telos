import { describe, it, expect } from "vitest";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TelosGraph, TelosNode } from "@telos/engine";
import { buildMcpServer, logged } from "./server.js";
import type { ToolContext } from "./tools.js";

function node(id: string): TelosNode {
  return {
    id, kind: "function", name: id, qualifiedName: `m/${id}`, language: "ts",
    path: `m/${id}.ts`, lineStart: 1, lineEnd: 9, layer: "service",
    fanIn: 0, fanOut: 0, lines: 9, complexity: 1, summary: null,
  };
}
function graph(): TelosGraph {
  return {
    nodes: [node("alpha"), node("beta")],
    edges: [{ sourceId: "alpha", targetId: "beta", kind: "calls", resolved: true }],
  };
}

describe("buildMcpServer", () => {
  it("constructs without throwing", () => {
    const server = buildMcpServer({ graph: graph(), store: null });
    expect(server).toBeTruthy();
  });
});

function ctxWith(telosDir: string): ToolContext {
  const g: TelosGraph = { nodes: [], edges: [] } as unknown as TelosGraph;
  return { graph: g, store: null, telosDir };
}

describe("mcp server logs queries", () => {
  it("appends an mcp-activity entry when a tool is called", async () => {
    const dir = mkdtempSync(join(tmpdir(), "telos-mcpsrv-"));
    const ctx = ctxWith(dir);
    const handler = logged(ctx, "telos_ask", async (args: { question: string }) => ({
      content: [{ type: "text" as const, text: `answer to: ${args.question}` }],
    }));
    await handler({ question: "where login" });
    const log = join(dir, "mcp-activity.jsonl");
    expect(existsSync(log)).toBe(true);
    const entry = JSON.parse(readFileSync(log, "utf8").trim());
    expect(entry.tool).toBe("telos_ask");
    expect(entry.argsSummary).toContain("where login");
    expect(typeof entry.resultTokens).toBe("number");
  });
});

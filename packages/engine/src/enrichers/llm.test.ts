import { describe, it, expect, vi } from "vitest";
import { TelosNode } from "../schema.js";
import { EnrichContext } from "../enrich.js";
import { createLlmEnricher, DEFAULT_LLM } from "./llm.js";

const node: TelosNode = {
  id: "a", kind: "function", name: "authenticate", qualifiedName: "auth.authenticate",
  language: "ts", path: "auth.ts", lineStart: 1, lineEnd: 9, layer: "api",
  fanIn: 3, fanOut: 1, lines: 9, complexity: 2, summary: null,
};
const ctx: EnrichContext = { graph: { nodes: [node], edges: [] }, callers: [], callees: [] };

function okResponse(text: string) {
  return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: text } }] }) } as Response;
}

describe("createLlmEnricher", () => {
  it("posts an OpenAI-compatible chat request and returns the model's summary", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse("Authenticates a user and returns a token."));
    const enricher = createLlmEnricher({ fetchImpl, model: "qwen2.5-coder:7b" });
    const out = await enricher.enrich(node, ctx);
    expect(out.summary).toBe("Authenticates a user and returns a token.");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`${DEFAULT_LLM.baseUrl}/chat/completions`);
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe("qwen2.5-coder:7b");
    expect(JSON.stringify(body.messages)).toContain("authenticate");
  });

  it("falls back to the heuristic summary when the model call fails", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const enricher = createLlmEnricher({ fetchImpl });
    const out = await enricher.enrich(node, ctx);
    expect(out.summary).toContain("authenticate"); // heuristic structural summary
    expect(out.summary).toContain("called by 3");
  });

  it("falls back when the response is malformed", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) } as Response);
    const out = await createLlmEnricher({ fetchImpl }).enrich(node, ctx);
    expect(out.summary).toContain("authenticate");
  });
});

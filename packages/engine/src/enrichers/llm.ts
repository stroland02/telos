import { Enricher, EnrichContext } from "../enrich.js";
import { TelosNode } from "../schema.js";
import { heuristicEnricher } from "./heuristic.js";

export interface LlmConfig {
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  timeoutMs?: number;
  fallback?: Enricher;
  fetchImpl?: typeof fetch;
}

export const DEFAULT_LLM = { baseUrl: "http://localhost:11434/v1", model: "qwen2.5-coder:7b" };

const SYSTEM =
  "You document code. Given a symbol and its context, reply with ONE concise sentence " +
  "(<= 20 words) describing what it does. No preamble, no markdown, no quotes.";

function userPrompt(node: TelosNode, ctx: EnrichContext): string {
  const callers = ctx.callers.slice(0, 5).map((n) => n.name).join(", ") || "none";
  const callees = ctx.callees.slice(0, 5).map((n) => n.name).join(", ") || "none";
  return [
    `${node.kind} ${node.qualifiedName} (${node.language}, ${node.layer} layer)`,
    `file: ${node.path}, lines ${node.lineStart}-${node.lineEnd}`,
    `callers: ${callers}`,
    `callees: ${callees}`,
    "Describe what it does in one sentence.",
  ].join("\n");
}

/** OpenAI-compatible local LLM enricher. Falls back to the heuristic on any error. */
export function createLlmEnricher(config: LlmConfig = {}): Enricher {
  const baseUrl = config.baseUrl ?? DEFAULT_LLM.baseUrl;
  const model = config.model ?? DEFAULT_LLM.model;
  const fallback = config.fallback ?? heuristicEnricher;
  const doFetch = config.fetchImpl ?? fetch;
  const timeoutMs = config.timeoutMs ?? 30_000;

  return {
    name: "llm",
    async enrich(node, ctx) {
      try {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), timeoutMs);
        let res: Response;
        try {
          res = await doFetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
            },
            body: JSON.stringify({
              model,
              temperature: 0.1,
              messages: [
                { role: "system", content: SYSTEM },
                { role: "user", content: userPrompt(node, ctx) },
              ],
            }),
            signal: ac.signal,
          });
        } finally {
          clearTimeout(timer);
        }
        if (!res.ok) throw new Error(`LLM ${res.status}`);
        const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        const text = data.choices?.[0]?.message?.content?.trim();
        if (!text) throw new Error("empty completion");
        return { summary: text };
      } catch {
        return fallback.enrich(node, ctx);
      }
    },
  };
}

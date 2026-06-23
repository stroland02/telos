import Fastify, { FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { existsSync, readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { TraceAggregator, NodeIndex, parseOtlpTraces } from "@telos/engine";

/** Live trace state shared by the OTLP receiver and the SSE stream. */
export interface TraceHub { aggregator: TraceAggregator; index: NodeIndex }

export interface GraphProvider {
  getOverview(): unknown;
  getChildren(id: string): unknown | null;
  getNode(id: string): unknown | null;
  search(q: string): unknown[];
  getFiles(): { path: string }[];
  getFilePaths(): Set<string>;
  /** Optional: harness capability recommendations for a node. Absent on minimal providers. */
  getRecommendations?(id: string): { id: string; title: string }[];
  /** Optional: dependency-ordered guided tour. Absent on minimal providers. */
  getTour?(limit?: number): unknown[];
  /** Optional: "where does X happen?" answers. Absent on minimal providers. */
  getAnswers?(q: string, limit?: number): unknown[];
  /** Optional: live OTel trace hub. Absent on minimal providers. */
  getTraceHub?(): TraceHub;
  repoRoot: string | null;
}

export interface ServerOptions { staticDir?: string }

export function buildServer(provider: GraphProvider, options: ServerOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/api/health", async () => ({ status: "ok" }));

  app.get("/api/overview", async () => provider.getOverview());

  app.get<{ Querystring: { limit?: string } }>("/api/tour", async (req, reply) => {
    if (!provider.getTour) return reply.code(404).send({ error: "tour unavailable" });
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    return { stops: provider.getTour(limit) };
  });

  app.get<{ Querystring: { q?: string; limit?: string } }>("/api/ask", async (req, reply) => {
    if (!provider.getAnswers) return reply.code(404).send({ error: "ask unavailable" });
    const q = (req.query.q ?? "").trim();
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    return { answers: q.length === 0 ? [] : provider.getAnswers(q, limit) };
  });

  // ── Live OTel trace overlay (Phase 2 A1) ───────────────────────────────────
  // OTLP/HTTP JSON receiver. Standards path so a real OTel SDK exporter can
  // point straight at Telos. Tolerant: bad body → 400, bad spans skipped.
  app.post("/v1/traces", async (req, reply) => {
    const hub = provider.getTraceHub?.();
    if (!hub) return reply.code(404).send({ error: "trace ingest unavailable" });
    try {
      const spans = parseOtlpTraces(req.body);
      hub.aggregator.ingest(spans, hub.index);
    } catch {
      return reply.code(400).send({ error: "malformed OTLP body" });
    }
    return { partialSuccess: {} };
  });

  // One-shot snapshot — poll fallback and test surface.
  app.get("/api/trace/state", async (_req, reply) => {
    const hub = provider.getTraceHub?.();
    if (!hub) return reply.code(404).send({ error: "trace unavailable" });
    return hub.aggregator.snapshot();
  });

  // SSE live stream — pushes a TraceState snapshot ~every second.
  app.get("/api/trace/stream", async (req, reply) => {
    const hub = provider.getTraceHub?.();
    if (!hub) return reply.code(404).send({ error: "trace unavailable" });
    reply.hijack();
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    const send = () => reply.raw.write(`data: ${JSON.stringify(hub.aggregator.snapshot())}\n\n`);
    send();
    const tick = setInterval(send, 1000);
    const beat = setInterval(() => reply.raw.write(": heartbeat\n\n"), 15000);
    req.raw.on("close", () => { clearInterval(tick); clearInterval(beat); reply.raw.end(); });
  });

  app.get<{ Params: { id: string } }>("/api/cluster/:id", async (req, reply) => {
    const view = provider.getChildren(req.params.id);
    if (view === null) return reply.code(404).send({ error: "cluster not found" });
    return view;
  });

  app.get<{ Params: { id: string } }>("/api/node/:id", async (req, reply) => {
    const detail = provider.getNode(req.params.id);
    if (detail === null) return reply.code(404).send({ error: "node not found" });
    return detail;
  });

  app.get<{ Params: { id: string } }>("/api/node/:id/recommend", async (req, reply) => {
    if (!provider.getRecommendations) return reply.code(404).send({ error: "recommendations unavailable" });
    return { recommendations: provider.getRecommendations(req.params.id) };
  });

  app.get<{ Querystring: { q?: string } }>("/api/search", async (req) => {
    const q = (req.query.q ?? "").trim();
    return { results: q.length === 0 ? [] : provider.search(q) };
  });

  // ── /api/files — list all file-node paths, sorted ──────────────────────────
  app.get("/api/files", async () => {
    const files = provider.getFiles().map((n) => n.path);
    return { files };
  });

  // ── /api/source — read raw source for a known file node ────────────────────
  // Security: (1) repoRoot must be set, (2) resolved path must stay inside
  // repoRoot (path-traversal guard), (3) relPath must be a known file-node path
  // (graph allow-list, defense in depth), (4) file must exist on disk (404),
  // (5) content capped at 1 MB (400/413).
  app.get<{ Querystring: { path?: string } }>("/api/source", async (req, reply) => {
    const relPath = req.query.path;

    if (!relPath) {
      return reply.code(400).send({ error: "path query parameter required" });
    }

    const repoRoot = provider.repoRoot;
    if (!repoRoot) {
      return reply.code(500).send({ error: "server not configured with a repo root" });
    }

    // Resolve and check confinement to repoRoot
    const resolved = resolve(repoRoot, relPath);
    if (!resolved.startsWith(repoRoot + sep) && resolved !== repoRoot) {
      return reply.code(400).send({ error: "path escapes repository root" });
    }

    // Graph allow-list (defense in depth)
    const knownPaths = provider.getFilePaths();
    // Normalise: graph stores forward-slash paths; resolved may use OS sep
    const normalised = relPath.replace(/\\/g, "/");
    if (!knownPaths.has(normalised)) {
      return reply.code(400).send({ error: "path not found in graph" });
    }

    if (!existsSync(resolved)) {
      return reply.code(404).send({ error: "file not found on disk" });
    }

    const MAX_BYTES = 1_048_576; // 1 MB
    let content: string;
    try {
      const buf = readFileSync(resolved);
      if (buf.byteLength > MAX_BYTES) {
        return reply.code(413).send({ error: "file too large (>1 MB)" });
      }
      content = buf.toString("utf-8");
    } catch {
      return reply.code(500).send({ error: "could not read file" });
    }

    const lines = content.split("\n").filter((_, i, arr) => i < arr.length - 1 || arr[arr.length - 1] !== "").length;

    return { path: normalised, content, lines };
  });

  if (options.staticDir && existsSync(options.staticDir)) {
    app.register(fastifyStatic, { root: options.staticDir });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/")) return reply.code(404).send({ error: "not found" });
      return reply.sendFile("index.html"); // SPA fallback
    });
  }

  return app;
}

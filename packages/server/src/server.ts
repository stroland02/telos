import Fastify, { FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { existsSync, readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import type { ServerResponse } from "node:http";
import { TraceAggregator, TraceBuffer, LogBuffer, MetricBuffer, ProfileBuffer, ProcessBuffer, FileNodeRef, ProcessSample, NodeIndex, GraphDiff, parseOtlpTraces, parseOtlpLogs, parseOtlpMetrics, parseFoldedStacks, tagProcesses } from "@telos/engine";

/** Latest Forge build-loop checkpoint reflected onto the map. Ephemeral. */
export type ForgeState = { run: string; turn: number; costUsd: number; stop: string | null; diff: GraphDiff } | null;

/** Forge reflection channel: latest state + open SSE subscribers. */
export interface ForgeHub { state: ForgeState; subscribers: Set<ServerResponse> }

/** Live trace state shared by the OTLP receiver, SSE stream, and replay routes. */
export interface TraceHub { aggregator: TraceAggregator; buffer: TraceBuffer; logs: LogBuffer; metrics: MetricBuffer; profile: ProfileBuffer; processes: ProcessBuffer; fileNodes: FileNodeRef[]; index: NodeIndex; forge: ForgeHub }

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
      hub.buffer.record(spans);
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

  // OTLP/HTTP JSON logs receiver.
  app.post("/v1/logs", async (req, reply) => {
    const hub = provider.getTraceHub?.();
    if (!hub) return reply.code(404).send({ error: "log ingest unavailable" });
    try {
      hub.logs.record(parseOtlpLogs(req.body), hub.index);
    } catch {
      return reply.code(400).send({ error: "malformed OTLP body" });
    }
    return { partialSuccess: {} };
  });

  // Recent logs, optionally scoped to one node — "click a node to see its logs".
  app.get<{ Querystring: { node?: string; limit?: string } }>("/api/logs", async (req, reply) => {
    const hub = provider.getTraceHub?.();
    if (!hub) return reply.code(404).send({ error: "logs unavailable" });
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    return { logs: hub.logs.recent({ nodeId: req.query.node || undefined, limit }) };
  });

  // OTLP/HTTP JSON metrics receiver.
  app.post("/v1/metrics", async (req, reply) => {
    const hub = provider.getTraceHub?.();
    if (!hub) return reply.code(404).send({ error: "metric ingest unavailable" });
    try {
      hub.metrics.record(parseOtlpMetrics(req.body), hub.index);
    } catch {
      return reply.code(400).send({ error: "malformed OTLP body" });
    }
    return { partialSuccess: {} };
  });

  // Per-node metric series — drives the detail-panel sparklines.
  app.get<{ Querystring: { node?: string; limit?: string } }>("/api/metrics", async (req, reply) => {
    const hub = provider.getTraceHub?.();
    if (!hub) return reply.code(404).send({ error: "metrics unavailable" });
    const node = req.query.node;
    if (!node) return { series: [] };
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    return { series: hub.metrics.series(node, { limit }) };
  });

  // Profiling: folded/collapsed stacks in { folded: "..." }. Accumulates.
  app.post<{ Body: { folded?: string } }>("/v1/profile", async (req, reply) => {
    const hub = provider.getTraceHub?.();
    if (!hub) return reply.code(404).send({ error: "profile ingest unavailable" });
    try {
      hub.profile.record(parseFoldedStacks(req.body?.folded ?? ""), hub.index);
    } catch {
      return reply.code(400).send({ error: "malformed profile body" });
    }
    return { ok: true };
  });

  // Hot-path snapshot — drives the "🔥 Hot" map overlay.
  app.get<{ Querystring: { limit?: string } }>("/api/profile", async (req, reply) => {
    const hub = provider.getTraceHub?.();
    if (!hub) return reply.code(404).send({ error: "profile unavailable" });
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    return hub.profile.snapshot(limit);
  });

  // Process/OS telemetry: a collector pushes the current process snapshot;
  // each process is tagged to a graph node when its cmd references a file path.
  app.post<{ Body: { processes?: ProcessSample[] } }>("/v1/processes", async (req, reply) => {
    const hub = provider.getTraceHub?.();
    if (!hub) return reply.code(404).send({ error: "process ingest unavailable" });
    try {
      const samples = Array.isArray(req.body?.processes) ? req.body!.processes! : [];
      hub.processes.set(tagProcesses(samples, hub.fileNodes));
    } catch {
      return reply.code(400).send({ error: "malformed process body" });
    }
    return { ok: true };
  });

  // Latest process snapshot — drives the "▤ Procs" panel.
  app.get<{ Querystring: { limit?: string } }>("/api/processes", async (req, reply) => {
    const hub = provider.getTraceHub?.();
    if (!hub) return reply.code(404).send({ error: "processes unavailable" });
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    return { processes: hub.processes.latest(limit) };
  });

  // Recent traces (newest first) — the playback picker.
  app.get<{ Querystring: { limit?: string } }>("/api/trace/recent", async (req, reply) => {
    const hub = provider.getTraceHub?.();
    if (!hub) return reply.code(404).send({ error: "trace unavailable" });
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    return { traces: hub.buffer.recent(limit) };
  });

  // One trace's chronological node path — drives playback animation.
  app.get<{ Params: { id: string } }>("/api/trace/replay/:id", async (req, reply) => {
    const hub = provider.getTraceHub?.();
    if (!hub) return reply.code(404).send({ error: "trace unavailable" });
    const steps = hub.buffer.path(req.params.id, hub.index);
    if (steps === null) return reply.code(404).send({ error: "trace not found" });
    return { steps };
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

  // ── Forge reflection channel (Phase 4) — ephemeral, additive, no DB writes ──
  // A forge build loop POSTs each iteration's graph diff; the open map animates
  // added/changed/removed nodes. Same isolation guarantee as the trace signals.
  app.post<{ Body: { run: string; checkpoint: { turn: number; costUsd: number }; diff: GraphDiff; stop?: string | null } }>(
    "/v1/forge/diff",
    async (req, reply) => {
      const hub = provider.getTraceHub?.();
      if (!hub) return reply.code(404).send({ error: "forge channel unavailable" });
      const b = req.body;
      hub.forge.state = { run: b.run, turn: b.checkpoint.turn, costUsd: b.checkpoint.costUsd, stop: b.stop ?? null, diff: b.diff };
      const payload = `data: ${JSON.stringify(hub.forge.state)}\n\n`;
      for (const res of hub.forge.subscribers) res.write(payload);
      return { ok: true };
    },
  );

  app.get("/api/forge/state", async (_req, reply) => {
    const hub = provider.getTraceHub?.();
    if (!hub) return reply.code(404).send({ error: "forge channel unavailable" });
    return { state: hub.forge.state };
  });

  app.get("/api/forge/stream", async (req, reply) => {
    const hub = provider.getTraceHub?.();
    if (!hub) return reply.code(404).send({ error: "forge channel unavailable" });
    reply.hijack();
    reply.raw.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    if (hub.forge.state) reply.raw.write(`data: ${JSON.stringify(hub.forge.state)}\n\n`);
    hub.forge.subscribers.add(reply.raw);
    const beat = setInterval(() => reply.raw.write(": heartbeat\n\n"), 15000);
    req.raw.on("close", () => { clearInterval(beat); hub.forge.subscribers.delete(reply.raw); reply.raw.end(); });
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

# Telos Phase 2 · Slice A1 — Live OTel Trace Overlay (Design)

> Status: approved 2026-06-22. First slice of Phase 2 ("Sentinel goes live").
> Parent roadmap: `2026-06-19-telos-code-sentinel-design.md` §8.1.

## 1. Goal

Point a real OpenTelemetry-instrumented application at Telos and watch its
traffic animate over the existing architecture map: edges **pulse** with live
calls, nodes **heat** by latency, errors **flash** on the responsible node.

This is the flagship "it's alive" moment. It is deliberately the smallest
self-contained slice of Phase 2 that delivers that wow, and it reuses the
existing Fastify API server as the ingest endpoint — no schema migration
(the v1 schema already reserved `id`/`qualifiedName` as OTel join keys).

## 2. Non-Goals (deferred to later Phase 2 slices)

- Metrics & logs ingest (slice A3), continuous profiling / flame graphs (A2).
- Process / OS-level overlay (slice B1), Windows-native ETW (B2).
- OTLP **protobuf** encoding (JSON only for now).
- Persistence / time-travel of trace history (signal is ephemeral).
- Trace "playback as a path through the map" — fast-follow candidate, not A1.

## 3. Core Decisions (locked during brainstorming)

1. **First slice = A1 OTel trace overlay** (not process overlay / not replay-only).
2. **Ingest = OTLP/HTTP + JSON** — standards-compliant receiver, no protobuf
   dependency. Any real OTel SDK can export straight to Telos via
   `OTEL_EXPORTER_OTLP_ENDPOINT`.
3. **Span→node match = `code.*` attrs, fall back to span name** — prefer
   `code.namespace` + `code.function` → `qualifiedName`; fall back to
   `span.name` exact match; anything else is **unmapped** (tallied, never
   fabricated as a node).
4. **Live transport = SSE + in-memory rolling window** — Server-Sent Events
   over plain HTTP (native `EventSource`, no new dep); the server keeps a
   rolling time-window of per-node/per-edge counters and pushes aggregated
   snapshots ~every second. Signal is ephemeral — **no DB writes**.

## 4. Isolation Invariant

The overlay is **purely additive**. With no traffic flowing, the static map
behaves exactly as it does today; the live signal degrades to nothing and can
never break the base experience. This mirrors the Phase 3 enricher guardrail:
the core never hard-depends on the live feed.

## 5. Architecture & Data Flow

```
App (OTel SDK, OTLP/HTTP JSON exporter)
  → POST /v1/traces                         [server receiver]
  → parseOtlpTraces(body) → SpanRecord[]    [engine/trace/otlp.ts]
  → matchSpanToNode(span, index)            [engine/trace/match.ts]
  → aggregator.ingest(spans, index)         [engine/trace/aggregator.ts]
  ── every ~1s ──
  → aggregator.snapshot() → TraceState
  → GET /api/trace/stream (SSE)             [server]
  → EventSource → useTraceOverlay           [web]
  → React Flow edge pulse / node heat / error flash
```

## 6. Components & Files

### Engine (`packages/engine`) — pure, fully unit-tested

**`src/trace/otlp.ts`**
- `parseOtlpTraces(body: unknown): SpanRecord[]` — normalize an OTLP/HTTP JSON
  `ExportTraceServiceRequest` (resourceSpans → scopeSpans → spans) into a flat
  array. Tolerant: skips malformed spans, never throws on bad shape.
- `interface SpanRecord { traceId: string; spanId: string; parentSpanId?: string; name: string; durationMs: number; isError: boolean; attrs: Record<string, string> }`
- Duration from `endTimeUnixNano - startTimeUnixNano` (nanos → ms). `isError`
  from `status.code === 2` (STATUS_CODE_ERROR). `attrs` flattened from the
  OTLP key/`{stringValue|intValue|...}` value shape into plain strings.

**`src/trace/match.ts`**
- `buildNodeIndex(graph: TelosGraph): NodeIndex` — precompute a
  `qualifiedName → nodeId` map (and a static edge-pair set for edge animation).
- `matchSpanToNode(span: SpanRecord, index: NodeIndex): string | null` —
  try `${attrs["code.namespace"]}.${attrs["code.function"]}` then
  `attrs["code.function"]` then `span.name` against the index; `null` if none.

**`src/trace/aggregator.ts`**
- `class TraceAggregator` — constructed with `{ windowMs?: number; now?: () => number }`
  (default `windowMs` 30 000; injectable clock for tests).
- `ingest(spans: SpanRecord[], index: NodeIndex): void` — for each span resolve
  its node; record a timestamped event `{ ts, nodeId, durationMs, isError }`.
  For a span whose parent resolves to a **different** node `A` and self to `B`,
  record an edge event `(A→B)`. Unresolved spans → `unmapped++`. Edge pairs not
  present in the static graph → counted in `unmappedEdges` (tallied, not drawn).
- `snapshot(): TraceState` — evict events older than `windowMs`, then aggregate:
  per node `{ calls, p95Ms, errors }`, per (static) edge `{ calls, errors }`.
- `TraceState = { nodes: TraceNodeSignal[]; edges: TraceEdgeSignal[]; unmapped: number; unmappedEdges: number; windowMs: number }`
- `TraceNodeSignal = { id: string; calls: number; p95Ms: number; errors: number }`
- `TraceEdgeSignal = { sourceId: string; targetId: string; calls: number; errors: number }`

Exports added to `packages/engine/src/index.ts`.

### Server (`packages/server`)

- `POST /v1/traces` — the standard OTLP/HTTP traces path. Body JSON →
  `parseOtlpTraces` → `aggregator.ingest`. Returns `{ partialSuccess: {} }`
  (OTLP convention) on success; malformed body → 400. A single live
  `TraceAggregator` + `NodeIndex` are built from the loaded graph and held by
  the provider (new optional `getTraceAggregator?()` on `GraphProvider`, or a
  dedicated `TraceHub` passed to `buildServer`). Minimal providers without a
  hub → endpoints 404 (consistent with tour/ask).
- `GET /api/trace/state` — one-shot `aggregator.snapshot()` (poll fallback +
  test surface).
- `GET /api/trace/stream` — SSE: `Content-Type: text/event-stream`, emit
  `data: <TraceState JSON>\n\n` every ~1 s plus `: heartbeat\n\n` keep-alives;
  clean up the interval on connection close.

### Web (`apps/web`)

- `src/api/types.ts` — `TraceState`, `TraceNodeSignal`, `TraceEdgeSignal`.
- `src/api/client.ts` — `traceState(): Promise<TraceState>` and
  `subscribeTrace(onState, onError?): () => void` wrapping `EventSource`
  (returns an unsubscribe).
- `src/hooks/useTraceOverlay.ts` — subscribe when live mode is on; hold latest
  `TraceState`; expose `nodeSignal(id)` / `edgeSignal(src,tgt)` lookups and the
  `unmapped`/`windowMs` indicator data.
- Rendering: edge gets a `live` pulse class when `calls > 0`; node latency heat
  (color/glow scaled by `p95Ms`); error flash when `errors > 0`. Top-bar
  **"● Live"** toggle enables/disables the overlay. Small indicator chip shows
  window seconds + unmapped count (honest about misses).

### CLI (`packages/cli`)

- `telos trace --demo [--url http://localhost:3000]` — POST a synthetic OTLP
  JSON payload (a few spans matching nodes in the loaded graph) to a running
  server so the overlay can be demoed with no app to instrument. Last task.

## 7. Error Handling & Honesty

- Malformed OTLP body → 400; individual bad spans skipped (and excluded), the
  rest ingested.
- Unmatched spans / dynamic-only edges → tallied in `unmapped`/`unmappedEdges`
  and surfaced in the UI; never invented as graph elements.
- SSE auto-reconnects (native `EventSource`); server caps memory by time-evicting
  the window; interval cleared on disconnect.
- No graph / no hub → empty `TraceState` (200 on `/api/trace/state`) or 404 on
  the stream for minimal providers — consistent with existing optional routes.

## 8. Testing

- **Engine** — `otlp.test.ts` (fixture OTLP/HTTP JSON → `SpanRecord[]`, bad
  spans skipped); `match.test.ts` (`code.*` hit, `code.function`-only hit,
  `span.name` fallback hit, miss → `null`); `aggregator.test.ts` (node counts,
  p95, error count, edge derivation from parent→child, time-window eviction via
  injected clock, unmapped tally).
- **Server** — `POST /v1/traces` updates state; `GET /api/trace/state` returns
  the snapshot; one `/api/trace/stream` event parses as `TraceState`.
- **Web** — `useTraceOverlay` reduces SSE events to lookups; `client` subscribe
  unsubscribes cleanly; an edge gets the `live` class when `calls > 0`
  (`EventSource` mocked).

## 9. Scope Summary

**IN:** traces only · OTLP/HTTP JSON · `code.*`/name matching + unmapped tally ·
in-memory rolling window · SSE push · edge-pulse + latency-heat + error-flash ·
Live toggle · `telos trace --demo` emitter.

**OUT (later slices):** metrics/logs (A3) · profiling/flame (A2) · process
overlay (B1) · OTLP protobuf · persistence/time-travel · trace playback.

// OTLP/HTTP + JSON trace ingest. Normalizes an ExportTraceServiceRequest
// (resourceSpans → scopeSpans → spans) into a flat, tolerant SpanRecord[].
// Bad spans are skipped, never thrown — a live feed must not crash the server.

export interface SpanRecord {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  durationMs: number;
  isError: boolean;
  attrs: Record<string, string>;
}

/** OTLP AnyValue → string. Covers the encodings OTel SDKs actually emit. */
function anyValueToString(v: unknown): string {
  if (v == null || typeof v !== "object") return "";
  const o = v as Record<string, unknown>;
  if (typeof o.stringValue === "string") return o.stringValue;
  if (typeof o.intValue === "string" || typeof o.intValue === "number") return String(o.intValue);
  if (typeof o.boolValue === "boolean") return String(o.boolValue);
  if (typeof o.doubleValue === "number") return String(o.doubleValue);
  return "";
}

function flattenAttrs(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!Array.isArray(raw)) return out;
  for (const kv of raw) {
    if (kv && typeof kv === "object" && typeof (kv as { key?: unknown }).key === "string") {
      out[(kv as { key: string }).key] = anyValueToString((kv as { value?: unknown }).value);
    }
  }
  return out;
}

function nanoToMs(start: unknown, end: unknown): number {
  const s = typeof start === "string" || typeof start === "number" ? Number(start) : NaN;
  const e = typeof end === "string" || typeof end === "number" ? Number(end) : NaN;
  if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) return 0;
  return (e - s) / 1e6;
}

function parseSpan(raw: unknown): SpanRecord {
  const s = raw as Record<string, unknown>;
  if (typeof s.spanId !== "string" || typeof s.name !== "string") {
    throw new Error("span missing spanId/name");
  }
  const status = s.status as { code?: unknown } | undefined;
  return {
    traceId: typeof s.traceId === "string" ? s.traceId : "",
    spanId: s.spanId,
    parentSpanId: typeof s.parentSpanId === "string" && s.parentSpanId.length > 0 ? s.parentSpanId : undefined,
    name: s.name,
    durationMs: nanoToMs(s.startTimeUnixNano, s.endTimeUnixNano),
    isError: status?.code === 2,
    attrs: flattenAttrs(s.attributes),
  };
}

/** Parse an OTLP/HTTP JSON ExportTraceServiceRequest into flat SpanRecords. */
export function parseOtlpTraces(body: unknown): SpanRecord[] {
  const out: SpanRecord[] = [];
  const resourceSpans = (body as { resourceSpans?: unknown })?.resourceSpans;
  if (!Array.isArray(resourceSpans)) return out;
  for (const rs of resourceSpans) {
    const scopeSpans = (rs as { scopeSpans?: unknown })?.scopeSpans;
    if (!Array.isArray(scopeSpans)) continue;
    for (const ss of scopeSpans) {
      const spans = (ss as { spans?: unknown })?.spans;
      if (!Array.isArray(spans)) continue;
      for (const sp of spans) {
        try {
          out.push(parseSpan(sp));
        } catch {
          // skip malformed span, keep the rest
        }
      }
    }
  }
  return out;
}

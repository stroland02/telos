import { NodeIndex, matchByAttrs } from "./match.js";

// OTLP/HTTP + JSON logs ingest + a bounded ring of recent log records, each
// tagged with the graph node it maps to (via code.* attrs) or null. Ephemeral,
// like the trace aggregator/buffer — powers "click a node to see its logs".

export interface LogRecord {
  ts: number; // unix nanos (0 if absent)
  severity: string;
  body: string;
  attrs: Record<string, string>;
  traceId?: string;
  spanId?: string;
}

export interface StoredLog extends LogRecord {
  nodeId: string | null;
}

function anyValueToString(v: unknown): string {
  if (v == null || typeof v !== "object") return typeof v === "string" ? v : "";
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

function parseRecord(raw: unknown): LogRecord {
  const r = raw as Record<string, unknown>;
  const tsRaw = r.timeUnixNano ?? r.observedTimeUnixNano;
  const ts = typeof tsRaw === "string" || typeof tsRaw === "number" ? Number(tsRaw) : NaN;
  return {
    ts: Number.isFinite(ts) ? ts : 0,
    severity: typeof r.severityText === "string" ? r.severityText : "",
    body: anyValueToString(r.body),
    attrs: flattenAttrs(r.attributes),
    traceId: typeof r.traceId === "string" && r.traceId.length > 0 ? r.traceId : undefined,
    spanId: typeof r.spanId === "string" && r.spanId.length > 0 ? r.spanId : undefined,
  };
}

/** Parse an OTLP/HTTP JSON ExportLogsServiceRequest into flat LogRecords. */
export function parseOtlpLogs(body: unknown): LogRecord[] {
  const out: LogRecord[] = [];
  const resourceLogs = (body as { resourceLogs?: unknown })?.resourceLogs;
  if (!Array.isArray(resourceLogs)) return out;
  for (const rl of resourceLogs) {
    const scopeLogs = (rl as { scopeLogs?: unknown })?.scopeLogs;
    if (!Array.isArray(scopeLogs)) continue;
    for (const sl of scopeLogs) {
      const records = (sl as { logRecords?: unknown })?.logRecords;
      if (!Array.isArray(records)) continue;
      for (const rec of records) {
        try { out.push(parseRecord(rec)); } catch { /* skip malformed */ }
      }
    }
  }
  return out;
}

export class LogBuffer {
  private logs: StoredLog[] = [];
  private unmapped = 0;
  private readonly capacity: number;

  constructor(opts: { capacity?: number } = {}) {
    this.capacity = Math.max(1, opts.capacity ?? 500);
  }

  record(records: LogRecord[], index: NodeIndex): void {
    for (const r of records) {
      const nodeId = matchByAttrs(r.attrs, "", index);
      if (!nodeId) this.unmapped++;
      this.logs.push({ ...r, nodeId });
    }
    if (this.logs.length > this.capacity) this.logs.splice(0, this.logs.length - this.capacity);
  }

  /** Recent logs newest-first, optionally filtered to one node. */
  recent(opts: { nodeId?: string; limit?: number } = {}): StoredLog[] {
    const limit = Math.max(0, opts.limit ?? 50);
    const filtered = opts.nodeId ? this.logs.filter((l) => l.nodeId === opts.nodeId) : this.logs;
    return filtered.slice(-limit).reverse();
  }

  unmappedCount(): number { return this.unmapped; }
}

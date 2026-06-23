import { NodeIndex, matchByAttrs } from "./match.js";

// OTLP/HTTP + JSON metrics ingest + a per-node, per-metric ring of recent
// points. Supports gauge and sum number data points (the common case);
// histograms are skipped. Ephemeral, like the other live buffers — powers
// per-node time-series in the detail panel.

export interface MetricPoint {
  name: string;
  unit: string;
  ts: number; // unix nanos (0 if absent)
  value: number;
  attrs: Record<string, string>;
}

export interface MetricSeries {
  name: string;
  unit: string;
  latest: number;
  points: number[]; // recent values, oldest → newest
}

function flattenAttrs(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!Array.isArray(raw)) return out;
  for (const kv of raw) {
    const k = kv as { key?: unknown; value?: Record<string, unknown> };
    if (typeof k.key === "string") {
      const v = k.value ?? {};
      out[k.key] =
        typeof v.stringValue === "string" ? v.stringValue :
        v.intValue != null ? String(v.intValue) :
        typeof v.boolValue === "boolean" ? String(v.boolValue) :
        typeof v.doubleValue === "number" ? String(v.doubleValue) : "";
    }
  }
  return out;
}

function pointValue(dp: Record<string, unknown>): number {
  if (typeof dp.asDouble === "number") return dp.asDouble;
  if (dp.asInt != null && (typeof dp.asInt === "string" || typeof dp.asInt === "number")) return Number(dp.asInt);
  return NaN;
}

/** Parse an OTLP/HTTP JSON ExportMetricsServiceRequest into flat MetricPoints. */
export function parseOtlpMetrics(body: unknown): MetricPoint[] {
  const out: MetricPoint[] = [];
  const resourceMetrics = (body as { resourceMetrics?: unknown })?.resourceMetrics;
  if (!Array.isArray(resourceMetrics)) return out;
  for (const rm of resourceMetrics) {
    const scopeMetrics = (rm as { scopeMetrics?: unknown })?.scopeMetrics;
    if (!Array.isArray(scopeMetrics)) continue;
    for (const sm of scopeMetrics) {
      const metrics = (sm as { metrics?: unknown })?.metrics;
      if (!Array.isArray(metrics)) continue;
      for (const m of metrics) {
        const mm = m as Record<string, unknown>;
        const name = typeof mm.name === "string" ? mm.name : "";
        const unit = typeof mm.unit === "string" ? mm.unit : "";
        const dps = ((mm.gauge as { dataPoints?: unknown })?.dataPoints
          ?? (mm.sum as { dataPoints?: unknown })?.dataPoints);
        if (!Array.isArray(dps) || !name) continue;
        for (const raw of dps) {
          try {
            const dp = raw as Record<string, unknown>;
            const value = pointValue(dp);
            if (!Number.isFinite(value)) continue;
            const tsRaw = dp.timeUnixNano;
            const ts = typeof tsRaw === "string" || typeof tsRaw === "number" ? Number(tsRaw) : NaN;
            out.push({ name, unit, ts: Number.isFinite(ts) ? ts : 0, value, attrs: flattenAttrs(dp.attributes) });
          } catch { /* skip malformed point */ }
        }
      }
    }
  }
  return out;
}

export class MetricBuffer {
  // nodeId → metricName → recent points
  private byNode = new Map<string, Map<string, { unit: string; points: { ts: number; value: number }[] }>>();
  private unmapped = 0;
  private readonly perSeries: number;

  constructor(opts: { perSeries?: number } = {}) {
    this.perSeries = Math.max(1, opts.perSeries ?? 60);
  }

  record(points: MetricPoint[], index: NodeIndex): void {
    for (const p of points) {
      const nodeId = matchByAttrs(p.attrs, "", index);
      if (!nodeId) { this.unmapped++; continue; }
      let series = this.byNode.get(nodeId);
      if (!series) { series = new Map(); this.byNode.set(nodeId, series); }
      let s = series.get(p.name);
      if (!s) { s = { unit: p.unit, points: [] }; series.set(p.name, s); }
      s.points.push({ ts: p.ts, value: p.value });
      if (s.points.length > this.perSeries) s.points.splice(0, s.points.length - this.perSeries);
    }
  }

  /** Per-metric series for one node, sorted by metric name. */
  series(nodeId: string, opts: { limit?: number } = {}): MetricSeries[] {
    const limit = Math.max(1, opts.limit ?? this.perSeries);
    const series = this.byNode.get(nodeId);
    if (!series) return [];
    return [...series.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, s]) => {
        const recent = s.points.slice(-limit);
        return { name, unit: s.unit, latest: recent[recent.length - 1]?.value ?? 0, points: recent.map((p) => p.value) };
      });
  }

  unmappedCount(): number { return this.unmapped; }
}

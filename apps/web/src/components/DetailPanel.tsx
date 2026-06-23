import { useEffect, useRef } from "react";
import { NodeDetail, TelosNodeDTO, Recommendation, LogLine, MetricSeries } from "../api/types";

/** Minimal inline SVG sparkline — no chart lib. Flat line if all values equal. */
function Sparkline({ points, width = 96, height = 20 }: { points: number[]; width?: number; height?: number }) {
  if (points.length === 0) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const stepX = points.length > 1 ? width / (points.length - 1) : 0;
  const coords = points.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / span) * (height - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg width={width} height={height} role="img" aria-label="trend" style={{ display: "block" }}>
      <polyline points={coords} fill="none" stroke="var(--accent)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function MetricList({ series }: { series: MetricSeries[] }) {
  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2));
  return (
    <div>
      <div
        style={{
          fontSize: "var(--t-label-size)", lineHeight: "var(--t-label-lh)",
          fontWeight: "var(--t-label-weight)" as React.CSSProperties["fontWeight"],
          color: "var(--text-muted)", marginBottom: "var(--s-1)",
        }}
      >
        Metrics <span style={{ color: "var(--text-faint)", fontWeight: 400 }}>({series.length})</span>
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--s-1)" }}>
        {series.map((s) => (
          <li key={s.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--s-2)", padding: "var(--s-1) 0", borderBottom: "1px solid var(--border)" }}>
            <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--t-meta-size)", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={s.name}>{s.name}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-faint)" }}>{fmt(s.latest)}{s.unit && s.unit !== "1" ? ` ${s.unit}` : ""}</span>
            </div>
            <Sparkline points={s.points} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function sevColor(sev: string): string {
  const s = sev.toUpperCase();
  if (s.startsWith("ERR") || s === "FATAL" || s === "CRITICAL") return "var(--danger)";
  if (s.startsWith("WARN")) return "var(--complexity-moderate, var(--accent))";
  return "var(--text-faint)";
}

function LogList({ logs }: { logs: LogLine[] }) {
  return (
    <div>
      <div
        style={{
          fontSize: "var(--t-label-size)", lineHeight: "var(--t-label-lh)",
          fontWeight: "var(--t-label-weight)" as React.CSSProperties["fontWeight"],
          color: "var(--text-muted)", marginBottom: "var(--s-1)",
        }}
      >
        Recent logs <span style={{ color: "var(--text-faint)", fontWeight: 400 }}>({logs.length})</span>
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 1 }}>
        {logs.map((l, i) => (
          <li
            key={i}
            style={{
              display: "flex", gap: "var(--s-2)", padding: "var(--s-1) 0",
              borderBottom: "1px solid var(--border)", fontFamily: "var(--font-mono)",
              fontSize: "11px", lineHeight: "var(--t-meta-lh)",
            }}
          >
            <span style={{ color: sevColor(l.severity), fontWeight: 600, flexShrink: 0, minWidth: 38 }}>
              {l.severity || "LOG"}
            </span>
            <span style={{ color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={l.body}>
              {l.body}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Divider() {
  return (
    <hr
      style={{
        border: "none",
        borderTop: "1px solid var(--border)",
        margin: "var(--s-3) 0",
      }}
    />
  );
}

function NodeList({ title, nodes }: { title: string; nodes: TelosNodeDTO[] }) {
  return (
    <div>
      <div
        style={{
          fontSize: "var(--t-label-size)",
          lineHeight: "var(--t-label-lh)",
          fontWeight: "var(--t-label-weight)" as React.CSSProperties["fontWeight"],
          color: "var(--text-muted)",
          marginBottom: "var(--s-1)",
        }}
      >
        {title} <span style={{ color: "var(--text-faint)", fontWeight: 400 }}>({nodes.length})</span>
      </div>
      {nodes.length === 0 ? (
        <div style={{ fontSize: "var(--t-meta-size)", color: "var(--text-faint)", fontStyle: "italic" }}>None</div>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 1 }}>
          {nodes.map((n) => (
            <li
              key={n.id}
              style={{
                fontSize: "var(--t-meta-size)",
                lineHeight: "var(--t-meta-lh)",
                display: "flex",
                flexDirection: "column",
                gap: 1,
                padding: "var(--s-1) 0",
                borderBottom: "1px solid var(--border)",
              }}
            >
              {/* Node name — prominent */}
              <span
                style={{
                  color: "var(--text)",
                  fontWeight: 500,
                  fontFamily: "var(--font-ui)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {n.name}
              </span>
              {/* Path — muted mono, truncated with title for hover tooltip */}
              <span
                title={n.path}
                style={{
                  fontFamily: "var(--font-mono)",
                  color: "var(--text-faint)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontSize: "11px",
                }}
              >
                {n.path}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DetailPanel({ detail, onClose, recommendations = [], logs = [], metrics = [] }: { detail: NodeDetail | null; onClose: () => void; recommendations?: Recommendation[]; logs?: LogLine[]; metrics?: MetricSeries[] }) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // Close on Esc (§6 a11y); move focus to × on open
  useEffect(() => {
    if (!detail) return;
    closeBtnRef.current?.focus();
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [detail, onClose]);

  if (!detail) return null;
  const n = detail.node;

  // Extract basename for the heading; show full path as subtitle.
  // e.g. "apps/web/src/api/client.ts" → basename "client.ts"
  const basename = n.name.includes("/")
    ? n.name.split("/").pop() ?? n.name
    : n.name;

  // complexity 0 means "not computed" — omit rather than show misleading 0
  const complexityStr = n.complexity > 0 ? `complexity ${n.complexity}` : null;

  return (
    <aside
      role="complementary"
      aria-label="Node detail"
      style={{
        position: "absolute",
        top: 48,
        right: 0,
        bottom: 0,
        width: 320,
        background: "var(--surface)",
        borderLeft: "1px solid var(--border)",
        padding: "var(--s-4)",
        overflowY: "auto",
        fontFamily: "var(--font-ui)",
        boxShadow: "var(--shadow-panel)",
        display: "flex",
        flexDirection: "column",
        gap: 0,
        animation: "panelSlideIn 160ms ease-out",
      }}
    >
      <style>{`
        @keyframes panelSlideIn {
          from { transform: translateX(24px); opacity: 0; }
          to   { transform: translateX(0);   opacity: 1; }
        }
      `}</style>

      {/* ── Header row: [layer chip + basename] [×] ─────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--s-2)" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Layer chip — color signal matching node (design direction §5) */}
          <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", marginBottom: "var(--s-1)" }}>
            <span
              aria-hidden="true"
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: 2,
                background: `var(--layer-${n.layer}, var(--layer-unknown))`,
                flexShrink: 0,
                boxShadow: `0 0 6px var(--layer-${n.layer}-glow, var(--layer-unknown-glow))`,
              }}
            />
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--t-meta-size)",
                lineHeight: "var(--t-meta-lh)",
                color: "var(--text-faint)",
                textTransform: "lowercase",
              }}
            >
              {n.layer} · {n.kind}
            </span>
          </div>
          {/* Node basename as prominent heading */}
          <h2
            style={{
              margin: 0,
              fontSize: "var(--t-h-size)",
              lineHeight: "var(--t-h-lh)",
              fontWeight: "var(--t-h-weight)" as React.CSSProperties["fontWeight"],
              color: "var(--text)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontFamily: "var(--font-mono)",
            }}
            title={n.name}
          >
            {basename}
          </h2>
        </div>

        {/* Close button — focused on open for keyboard access */}
        <button
          ref={closeBtnRef}
          onClick={onClose}
          aria-label="Close detail panel"
          style={{
            flexShrink: 0,
            border: "none",
            background: "none",
            cursor: "pointer",
            color: "var(--text-muted)",
            fontSize: 18,
            lineHeight: 1,
            padding: "2px var(--s-1)",
            borderRadius: "var(--r-sm)",
            outline: "none",
            transition: "color 90ms ease",
            marginTop: 2,
          }}
          onFocus={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "0 0 0 2px var(--accent)"; }}
          onBlur={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
        >
          ×
        </button>
      </div>

      {/* Full path — muted mono subtitle, truncated with tooltip */}
      <div
        title={n.path}
        style={{
          marginTop: "var(--s-1)",
          fontFamily: "var(--font-mono)",
          fontSize: "11px",
          lineHeight: "var(--t-meta-lh)",
          color: "var(--text-faint)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {n.path}
      </div>

      {/* Metric chips row — lines + optional complexity */}
      <div
        style={{
          marginTop: "var(--s-2)",
          display: "flex",
          gap: "var(--s-1)",
          flexWrap: "wrap",
        }}
      >
        <MetaChip label={`${n.lines} lines`} />
        {complexityStr && <MetaChip label={complexityStr} />}
      </div>

      {n.summary && (
        <>
          <Divider />
          <div>
            <div
              style={{
                fontSize: "var(--t-label-size)",
                lineHeight: "var(--t-label-lh)",
                fontWeight: "var(--t-label-weight)" as React.CSSProperties["fontWeight"],
                color: "var(--text-muted)",
                marginBottom: "var(--s-1)",
              }}
            >
              Summary
            </div>
            <p style={{ margin: 0, fontSize: "var(--t-meta-size)", lineHeight: "var(--t-meta-lh)", color: "var(--text)" }}>
              {n.summary}
            </p>
          </div>
        </>
      )}

      <Divider />

      <NodeList title="Callers" nodes={detail.callers} />

      <Divider />

      <NodeList title="Callees" nodes={detail.callees} />

      {metrics.length > 0 && (
        <>
          <Divider />
          <MetricList series={metrics} />
        </>
      )}

      {logs.length > 0 && (
        <>
          <Divider />
          <LogList logs={logs} />
        </>
      )}

      {recommendations.length > 0 && (
        <>
          <Divider />
          <div>
            <div
              style={{
                fontSize: "var(--t-label-size)",
                lineHeight: "var(--t-label-lh)",
                fontWeight: "var(--t-label-weight)" as React.CSSProperties["fontWeight"],
                color: "var(--text-muted)",
                marginBottom: "var(--s-1)",
              }}
            >
              Suggested actions <span style={{ color: "var(--text-faint)", fontWeight: 400 }}>({recommendations.length})</span>
            </div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--s-1)" }}>
              {recommendations.map((r) => (
                <li
                  key={r.id}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 1,
                    padding: "var(--s-1) var(--s-2)",
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--r-sm)",
                  }}
                >
                  <span style={{ fontSize: "var(--t-meta-size)", color: "var(--text)", fontWeight: 500 }}>{r.title}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-faint)" }}>{r.id}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </aside>
  );
}

/** Small pill chip for meta values — matches node chip style but on --surface. */
function MetaChip({ label }: { label: string }) {
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "var(--t-meta-size)",
        lineHeight: "var(--t-meta-lh)",
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-sm)",
        padding: "0 var(--s-1)",
        color: "var(--text-muted)",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

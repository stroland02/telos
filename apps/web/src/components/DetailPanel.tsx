import { useEffect } from "react";
import { NodeDetail, TelosNodeDTO } from "../api/types";

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
        {title} ({nodes.length})
      </div>
      {nodes.length === 0 ? (
        <div style={{ fontSize: "var(--t-meta-size)", color: "var(--text-faint)" }}>—</div>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 2 }}>
          {nodes.map((n) => (
            <li
              key={n.id}
              style={{
                fontSize: "var(--t-meta-size)",
                lineHeight: "var(--t-meta-lh)",
                display: "flex",
                gap: "var(--s-2)",
                alignItems: "baseline",
              }}
            >
              <span style={{ color: "var(--text)", fontWeight: 500 }}>{n.name}</span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  color: "var(--text-muted)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
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

export function DetailPanel({ detail, onClose }: { detail: NodeDetail | null; onClose: () => void }) {
  // Close on Esc (§6 a11y)
  useEffect(() => {
    if (!detail) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [detail, onClose]);

  if (!detail) return null;
  const n = detail.node;

  return (
    <aside
      aria-label="Node detail"
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        width: 320,
        height: "100%",
        background: "var(--surface)",
        borderLeft: "1px solid var(--border)",
        padding: "var(--s-4)",
        overflowY: "auto",
        fontFamily: "var(--font-ui)",
        boxShadow: "-8px 0 24px rgba(0,0,0,.35)",
        display: "flex",
        flexDirection: "column",
        gap: 0,
        // slide-in animation
        animation: "panelSlideIn 160ms ease-out",
      }}
    >
      <style>{`
        @keyframes panelSlideIn {
          from { transform: translateX(24px); opacity: 0; }
          to   { transform: translateX(0);   opacity: 1; }
        }
      `}</style>

      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--s-2)" }}>
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
          }}
        >
          {n.name}
        </h2>
        <button
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
          }}
          onFocus={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "0 0 0 2px var(--accent)"; }}
          onBlur={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
        >
          ×
        </button>
      </div>

      {/* Path */}
      <div
        style={{
          marginTop: "var(--s-1)",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--t-meta-size)",
          lineHeight: "var(--t-meta-lh)",
          color: "var(--text-muted)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {n.path}
      </div>

      {/* Meta line */}
      <div
        style={{
          marginTop: "var(--s-2)",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--t-meta-size)",
          lineHeight: "var(--t-meta-lh)",
          color: "var(--text-faint)",
        }}
      >
        {n.kind} · {n.layer} · {n.lines} lines · complexity {n.complexity}
      </div>

      <Divider />

      <NodeList title="Callers" nodes={detail.callers} />

      <Divider />

      <NodeList title="Callees" nodes={detail.callees} />
    </aside>
  );
}

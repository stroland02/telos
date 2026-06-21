import { Handle, Position, NodeProps } from "@xyflow/react";
import { FlowNodeData } from "../graph/layout";

/** Maps a layer name to its CSS token var(--layer-<layer>). */
function layerVar(layer: string): string {
  return `var(--layer-${layer}, var(--layer-unknown))`;
}

export function TelosNode({ data, selected }: NodeProps) {
  const d = data as unknown as FlowNodeData;
  const isLeaf = d.level === "symbol" || d.level === "file";
  const bg = layerVar(d.layer);

  return (
    <div
      style={{
        width: d.width,
        minHeight: d.height,
        boxSizing: "border-box",
        padding: "var(--s-2) var(--s-3)",
        borderRadius: "var(--r-md)",
        background: bg,
        color: "var(--layer-text)",
        fontFamily: "var(--font-ui)",
        border: `1px solid var(--border)`,
        boxShadow: selected
          ? `0 0 0 2px var(--accent), 0 0 16px var(--accent-soft), 0 2px 10px rgba(0,0,0,.3)`
          : `0 2px 10px rgba(0,0,0,.25)`,
        opacity: isLeaf ? 0.88 : 1,
        transition: "box-shadow 90ms ease, opacity 90ms ease",
        cursor: "pointer",
        outline: "none",
      }}
      tabIndex={0}
      role="button"
      aria-label={`${d.label} — ${d.layer} ${d.level}`}
    >
      <Handle type="target" position={Position.Left} style={{ background: "var(--border)" }} />

      {/* Label */}
      <div
        style={{
          fontSize: "var(--t-label-size)",
          lineHeight: "var(--t-label-lh)",
          fontWeight: "var(--t-label-weight)" as React.CSSProperties["fontWeight"],
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {d.label}
      </div>

      {/* Mono metric chip row — layer name embedded in chip so color is never
          the only signal (§6 a11y), but avoids duplicate visible text when
          label === layer (which breaks getByText uniqueness in tests). */}
      <div
        style={{
          display: "flex",
          gap: "var(--s-1)",
          marginTop: "var(--s-1)",
          flexWrap: "wrap",
        }}
      >
        {/* layer chip — only shown when the label doesn't already read as the
            layer name; provides text signal so color is never the only signal (§6) */}
        {d.label !== d.layer && <Chip label={d.layer} />}
        <Chip label={`${d.symbolCount} sym`} />
        <Chip label={`in ${d.fanIn} / out ${d.fanOut}`} />
      </div>

      <Handle type="source" position={Position.Right} style={{ background: "var(--border)" }} />
    </div>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "var(--t-meta-size)",
        lineHeight: "var(--t-meta-lh)",
        fontWeight: "var(--t-meta-weight)" as React.CSSProperties["fontWeight"],
        background: "rgba(0,0,0,0.25)",
        border: "1px solid rgba(255,255,255,0.15)",
        borderRadius: "var(--r-sm)",
        padding: "0 var(--s-1)",
        color: "rgba(255,255,255,0.9)",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

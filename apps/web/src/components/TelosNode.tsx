import { Handle, Position, NodeProps } from "@xyflow/react";
import { FlowNodeData } from "../graph/layout";

// Inject sentinel pulse keyframes once — no CSS module needed, no hard-coded hex.
// Uses var(--accent-soft) token from tokens.css. The global reduced-motion guard
// in tokens.css suppresses this animation automatically.
if (typeof document !== "undefined" && !document.getElementById("telos-node-keyframes")) {
  const s = document.createElement("style");
  s.id = "telos-node-keyframes";
  s.textContent = `
    @keyframes sentinelPulse {
      0%,100% { filter: brightness(1); }
      50%     { filter: brightness(1.18) drop-shadow(0 0 12px var(--accent-soft)); }
    }
  `;
  document.head.appendChild(s);
}

/** Maps a layer name to its CSS token var(--layer-<layer>). */
function layerVar(layer: string): string {
  return `var(--layer-${layer}, var(--layer-unknown))`;
}

/** Maps a layer name to its glow token var(--layer-<layer>-glow). */
function layerGlowVar(layer: string): string {
  return `var(--layer-${layer}-glow, var(--layer-unknown-glow))`;
}

/** Maps complexity value to a tier label (SonarQube / cyclomatic standard). */
function complexityTier(c: number): { label: string; color: string; bg: string } | null {
  if (c <= 0) return null; // 0 = unknown/not computed — don't show badge
  if (c < 5)  return { label: "simple",   color: "var(--complexity-simple)",   bg: "var(--complexity-simple-bg)" };
  if (c <= 15) return { label: "moderate", color: "var(--complexity-moderate)", bg: "var(--complexity-moderate-bg)" };
  return          { label: "complex",  color: "var(--complexity-complex)",  bg: "var(--complexity-complex-bg)" };
}

export function TelosNode({ data, selected }: NodeProps) {
  const d = data as unknown as FlowNodeData & { _pathOn?: boolean | null; _pathDim?: boolean };
  const isLeaf = d.level === "symbol" || d.level === "file";
  const bg = layerVar(d.layer);
  const glow = layerGlowVar(d.layer);

  // Path-finder overlay: _pathOn = this node is ON the found path (accent ring);
  // _pathDim = path exists but this node is NOT on it (fade out).
  const pathOn = d._pathOn === true;
  const pathDim = d._pathDim === true;

  const shadow = (selected || pathOn)
    ? `0 0 0 2px var(--accent), 0 0 20px var(--accent-soft), 0 2px 12px ${glow}`
    : `0 0 0 1px ${glow} inset, 0 2px 12px ${glow}`;

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
        boxShadow: shadow,
        opacity: pathDim ? 0.12 : isLeaf ? 0.85 : 1,
        transition: "box-shadow 120ms ease, opacity 120ms ease",
        cursor: "pointer",
        outline: "none",
        animation: (selected || pathOn) ? "sentinelPulse var(--sentinel-pulse-duration) ease-in-out 2" : "none",
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
        {/* Complexity badge — only rendered when complexity is known (>0) */}
        {complexityTier(d.complexity) && (
          <ComplexityBadge tier={complexityTier(d.complexity)!} />
        )}
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

function ComplexityBadge({ tier }: { tier: { label: string; color: string; bg: string } }) {
  return (
    <span
      aria-label={`complexity: ${tier.label}`}
      title={`Cyclomatic complexity: ${tier.label}`}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "var(--t-meta-size)",
        lineHeight: "var(--t-meta-lh)",
        fontWeight: 600,
        background: tier.bg,
        border: `1px solid ${tier.color}`,
        borderRadius: "var(--r-sm)",
        padding: "0 var(--s-1)",
        color: tier.color,
        whiteSpace: "nowrap",
        letterSpacing: "0.02em",
      }}
    >
      {tier.label}
    </span>
  );
}

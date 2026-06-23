import { Handle, Position, NodeProps } from "@xyflow/react";
import { FlowNodeData } from "../graph/layout";
import type { DensityMode } from "../graph/useDensity";

/**
 * Module-level density ref — updated by MapView before each render cycle.
 * React Flow custom node components can't receive extra props, so this is
 * the standard pattern for passing render-time context to custom nodes.
 */
export let currentDensity: DensityMode = "learn";
export function setCurrentDensity(d: DensityMode) { currentDensity = d; }

// Inject sentinel pulse keyframes + node hover style once — no CSS module needed.
// Uses design-token vars from tokens.css. The global reduced-motion guard
// in tokens.css suppresses animations automatically.
if (typeof document !== "undefined" && !document.getElementById("telos-node-keyframes")) {
  const s = document.createElement("style");
  s.id = "telos-node-keyframes";
  s.textContent = `
    @keyframes sentinelPulse {
      0%,100% { filter: brightness(1); }
      50%     { filter: brightness(1.18) drop-shadow(0 0 12px var(--accent-soft)); }
    }
    /* Hover lift — 90ms per design direction §4. Brightens the node and
       amplifies the layer glow so the cursor position reads immediately.
       CSS :hover avoids re-render on every mouse move (React approach would
       be onMouseEnter/Leave state which triggers full node re-render). */
    .telos-node:hover {
      filter: brightness(1.10);
      transform: translateY(-1px);
      transition: filter 90ms ease, transform 90ms ease, box-shadow 90ms ease !important;
    }
    .telos-node {
      transition: box-shadow 120ms ease, opacity 120ms ease, filter 90ms ease, transform 90ms ease;
    }
    /* WCAG 2.2 SC 2.4.11 focus-visible ring — 2px --accent outline, visible to
       keyboard users only (:focus-visible, not :focus, to avoid mouse click rings).
       box-shadow layered over the existing layer glow: accent ring outermost,
       glow innermost, so the cyan sentinel ring is always unambiguous.
       Contrast: --accent (#22D3EE) against --bg (#0B0F14) = 8.6:1 (AAA). */
    .telos-node:focus-visible {
      outline: none;
      box-shadow:
        0 0 0 2px var(--accent),
        0 0 16px var(--accent-soft) !important;
    }
  `;
  document.head.appendChild(s);
}

/** Maps a layer name to its CSS token var(--layer-<layer>). */
function layerVar(layer: string): string {
  return `var(--layer-${layer}, var(--layer-unknown))`;
}

/**
 * Per-layer text color — falls through the cascade:
 *   1. --layer-text-<layer>  (may be overridden in light theme, e.g. unknown/util)
 *   2. --layer-text           (default white in dark, unchanged in light)
 * This ensures WCAG AA for low-contrast layers (unknown, util) in light theme
 * while keeping white text on all layers in the dark theme.
 */
function layerTextVar(layer: string): string {
  return `var(--layer-text-${layer}, var(--layer-text))`;
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
  const d = data as unknown as FlowNodeData & {
    _pathOn?: boolean | null; _pathDim?: boolean;
    _liveCalls?: number; _liveErr?: boolean;
  };
  const isLeaf = d.level === "symbol" || d.level === "file";

  // Live trace overlay: a node carrying recent traffic gets an accent ring and
  // a continuous pulse; errors flash in the danger color. Purely additive.
  const liveCalls = d._liveCalls ?? 0;
  const isLive = liveCalls > 0;
  const liveErr = d._liveErr === true;
  const liveColor = liveErr ? "var(--danger)" : "var(--accent)";
  const density = currentDensity;
  const bg = layerVar(d.layer);
  const glow = layerGlowVar(d.layer);
  const nodeTextColor = layerTextVar(d.layer);

  // Path-finder overlay: _pathOn = this node is ON the found path (accent ring);
  // _pathDim = path exists but this node is NOT on it (fade out).
  const pathOn = d._pathOn === true;
  const pathDim = d._pathDim === true;

  const shadow = (selected || pathOn)
    ? `0 0 0 2px var(--accent), 0 0 20px var(--accent-soft), 0 2px 12px ${glow}`
    : isLive
    ? `0 0 0 2px ${liveColor}, 0 0 18px ${liveColor}, 0 2px 12px ${glow}`
    : `0 0 0 1px ${glow} inset, 0 2px 12px ${glow}`;

  return (
    <div
      className="telos-node"
      style={{
        width: d.width,
        minHeight: d.height,
        boxSizing: "border-box",
        padding: "var(--s-2) var(--s-3)",
        borderRadius: "var(--r-md)",
        background: bg,
        color: nodeTextColor,
        fontFamily: "var(--font-ui)",
        border: `1px solid var(--border)`,
        boxShadow: shadow,
        opacity: pathDim ? 0.12 : isLeaf ? 0.85 : 1,
        cursor: "pointer",
        outline: "none",
        animation: (selected || pathOn)
          ? "sentinelPulse var(--sentinel-pulse-duration) ease-in-out 2"
          : isLive
          ? "sentinelPulse var(--sentinel-pulse-duration) ease-in-out infinite"
          : "none",
      }}
      tabIndex={0}
      role="button"
      aria-label={`${d.label} — ${d.layer} ${d.level}${isLive ? ` — live: ${liveCalls} calls` : ""}`}
    >
      {/* Handles are structurally required for RF edge routing but invisible
          in this read-only view — no edge dragging is offered to the user.
          opacity:0 hides them while keeping RF's internal geometry intact. */}
      <Handle type="target" position={Position.Left} style={{ opacity: 0, pointerEvents: "none" }} />

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

      {/* Mono metric chip row — controlled by density mode:
          overview = no chips (label only, calmest scan)
          learn    = layer + sym count (default)
          deep     = all chips including in/out + complexity */}
      {density !== "overview" && (
        <div
          style={{
            display: "flex",
            gap: "var(--s-1)",
            marginTop: "var(--s-1)",
            flexWrap: "wrap",
          }}
        >
          {/* layer chip — text signal so color is never the only signal (§6 a11y) */}
          {d.label !== d.layer && <Chip label={d.layer} />}
          <Chip label={`${d.symbolCount} sym`} />
          {/* deep mode: show in/out edges and complexity */}
          {density === "deep" && (
            <>
              <Chip label={`in ${d.fanIn} / out ${d.fanOut}`} />
              {complexityTier(d.complexity) && (
                <ComplexityBadge tier={complexityTier(d.complexity)!} />
              )}
            </>
          )}
        </div>
      )}

      <Handle type="source" position={Position.Right} style={{ opacity: 0, pointerEvents: "none" }} />
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
        background: "var(--chip-bg)",
        border: "1px solid var(--chip-border)",
        borderRadius: "var(--r-sm)",
        padding: "0 var(--s-1)",
        color: "var(--chip-text)",
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

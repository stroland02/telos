/**
 * LayerLegend — elegant floating color→layer key.
 *
 * Design decisions (Carbon legend best-practice + WCAG 2.2 AA):
 *   - Positioned bottom-left, above React Flow Controls, so it never obscures
 *     the graph center and is near where the eye exits a left-to-right flow diagram.
 *   - Each entry: color swatch + text label (color is never the only signal).
 *   - Only renders layers that are actually present in the current view
 *     (dynamic, not a static full list — reduces noise).
 *   - Token-styled: no hard-coded hex in markup; swatches derive from
 *     --layer-<name> CSS tokens defined in tokens.css.
 *   - role="list" + role="listitem" for a11y; aria-label on the container.
 *   - Unobtrusive: low surface, border, subtle shadow; does not dominate.
 *
 * Research sources:
 *   - Carbon Design System legends: https://carbondesignsystem.com/data-visualization/legends/
 *   - WCAG 2.2: color alone is insufficient (SC 1.4.1)
 */

import type { Layer } from "../api/types";

// The canonical ordered layer list from the design direction §2.
// Order matters: it matches the semantic stack (entrypoints → helpers).
const LAYER_ORDER: Layer[] = ["api", "service", "data", "ui", "infra", "util", "unknown"];

interface LayerLegendProps {
  /** Set of layer names actually present in the current view. */
  activeLayers: Set<Layer>;
}

export function LayerLegend({ activeLayers }: LayerLegendProps) {
  const layers = LAYER_ORDER.filter((l) => activeLayers.has(l));
  if (layers.length === 0) return null;

  return (
    <div
      aria-label="Layer legend"
      style={{
        position: "absolute",
        // Bottom-left; sits above the React Flow controls (which are ~32px tall + margin)
        bottom: "calc(var(--s-8) + var(--s-6) + 10px)",
        left: "var(--s-4)",
        zIndex: 5,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-md)",
        padding: "var(--s-2) var(--s-3)",
        boxShadow: "-2px 4px 16px rgba(0,0,0,.28)",
        backdropFilter: "blur(4px)",
        minWidth: 100,
      }}
    >
      {/* Heading — tertiary, does not compete with map */}
      <div
        style={{
          fontSize: "var(--t-meta-size)",
          lineHeight: "var(--t-meta-lh)",
          fontWeight: 600,
          color: "var(--text-faint)",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          marginBottom: "var(--s-1)",
          userSelect: "none",
        }}
      >
        Layers
      </div>

      {/* Layer list */}
      <ul
        role="list"
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: "var(--s-1)",
        }}
      >
        {layers.map((layer) => (
          <li
            key={layer}
            role="listitem"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--s-2)",
            }}
          >
            {/* Color swatch — derived from token; aria-hidden since text label follows */}
            <span
              aria-hidden="true"
              style={{
                display: "inline-block",
                width: 10,
                height: 10,
                borderRadius: 3,
                background: `var(--layer-${layer}, var(--layer-unknown))`,
                flexShrink: 0,
                boxShadow: `0 0 6px var(--layer-${layer})`,
              }}
            />
            {/* Text label — the a11y signal; color is supplementary */}
            <span
              style={{
                fontSize: "var(--t-meta-size)",
                lineHeight: "var(--t-meta-lh)",
                color: "var(--text-muted)",
                fontFamily: "var(--font-ui)",
                userSelect: "none",
              }}
            >
              {layer}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

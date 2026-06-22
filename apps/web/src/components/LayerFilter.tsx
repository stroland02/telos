/**
 * LayerFilter — interactive layer-visibility toggles, replacing the static legend.
 *
 * Design decisions (WCAG 2.2 + graph-tool UX patterns):
 *   - Each layer row is a toggle button (aria-pressed) — color swatch + label +
 *     muted state when hidden; color never the only signal.
 *   - Positioned bottom-left, above React Flow Controls.
 *   - When a layer is hidden, its rows dim and a strikethrough signals removal.
 *   - Token-styled: no hard-coded hex in markup.
 *   - "All" / "None" convenience shortcuts reduce friction on a 7-layer graph.
 *
 * Research:
 *   - WCAG 2.2 SC 4.1.2: toggle buttons need aria-pressed.
 *   - Understand-Anything demo chip pattern: filter chips above the canvas.
 *   - Carbon Design System legends & filter chip docs.
 */

import type { Layer } from "../api/types";

// Canonical layer order: entrypoints → helpers.
export const LAYER_ORDER: Layer[] = ["api", "service", "data", "ui", "infra", "util", "unknown"];

export interface LayerFilterProps {
  /** Set of layer names present in the current view. */
  activeLayers: Set<Layer>;
  /** Set of layers that are currently visible (not filtered out). */
  visibleLayers: Set<Layer>;
  /** Called when user toggles a layer. */
  onToggle: (layer: Layer) => void;
  /** Called to show all layers. */
  onShowAll: () => void;
}

export function LayerFilter({ activeLayers, visibleLayers, onToggle, onShowAll }: LayerFilterProps) {
  const layers = LAYER_ORDER.filter((l) => activeLayers.has(l));
  if (layers.length === 0) return null;

  const allVisible = layers.every((l) => visibleLayers.has(l));

  return (
    <div
      aria-label="Layer filter"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-md)",
        padding: "var(--s-2) var(--s-3)",
        boxShadow: "-2px 4px 16px rgba(0,0,0,.28)",
        backdropFilter: "blur(4px)",
        minWidth: 110,
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "var(--s-1)",
        }}
      >
        <span
          style={{
            fontSize: "var(--t-meta-size)",
            lineHeight: "var(--t-meta-lh)",
            fontWeight: 600,
            color: "var(--text-faint)",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            userSelect: "none",
          }}
        >
          Layers
        </span>
        {/* "Show all" convenience — only rendered when something is hidden */}
        {!allVisible && (
          <button
            onClick={onShowAll}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "0 0 0 var(--s-2)",
              fontSize: "var(--t-meta-size)",
              lineHeight: "var(--t-meta-lh)",
              color: "var(--accent)",
              fontFamily: "var(--font-ui)",
            }}
            aria-label="Show all layers"
          >
            all
          </button>
        )}
      </div>

      {/* Toggle list */}
      <ul
        role="list"
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        {layers.map((layer) => {
          const isOn = visibleLayers.has(layer);
          return (
            <li key={layer} role="listitem">
              <button
                role="button"
                aria-pressed={isOn}
                aria-label={`${isOn ? "Hide" : "Show"} ${layer} layer`}
                onClick={() => onToggle(layer)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--s-2)",
                  width: "100%",
                  background: "none",
                  border: "none",
                  borderRadius: "var(--r-sm)",
                  padding: "2px var(--s-1)",
                  cursor: "pointer",
                  opacity: isOn ? 1 : 0.38,
                  transition: "opacity 120ms ease, background 80ms ease",
                  outline: "none",
                }}
                onFocus={(e) => {
                  (e.currentTarget as HTMLElement).style.boxShadow = "0 0 0 2px var(--accent)";
                }}
                onBlur={(e) => {
                  (e.currentTarget as HTMLElement).style.boxShadow = "none";
                }}
              >
                {/* Color swatch */}
                <span
                  aria-hidden="true"
                  style={{
                    display: "inline-block",
                    width: 10,
                    height: 10,
                    borderRadius: 3,
                    background: `var(--layer-${layer}, var(--layer-unknown))`,
                    flexShrink: 0,
                    boxShadow: isOn ? `0 0 6px var(--layer-${layer})` : "none",
                    transition: "box-shadow 120ms ease",
                  }}
                />
                {/* Text label */}
                <span
                  style={{
                    fontSize: "var(--t-meta-size)",
                    lineHeight: "var(--t-meta-lh)",
                    color: isOn ? "var(--text-muted)" : "var(--text-faint)",
                    fontFamily: "var(--font-ui)",
                    userSelect: "none",
                    textDecoration: isOn ? "none" : "line-through",
                    transition: "color 120ms ease",
                  }}
                >
                  {layer}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

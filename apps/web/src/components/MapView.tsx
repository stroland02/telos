import { useMemo, useState, useCallback } from "react";
import { ReactFlow, Background, BackgroundVariant, Controls, MiniMap } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { NavigationState } from "../graph/useNavigation";
import { toFlowGraph } from "../graph/layout";
import { TelosNode } from "./TelosNode";
import { LayerFilter, LAYER_ORDER } from "./LayerFilter";
import type { Layer } from "../api/types";

// Static hex map for MiniMap nodeColor callback (CSS vars not resolvable there).
// Values mirror tokens.css --layer-* exactly — no hard-coded hex in components.
const LAYER_HEX: Record<string, string> = {
  api:     "#3B82F6",
  service: "#8B5CF6",
  data:    "#10B981",
  ui:      "#EC4899",
  infra:   "#F59E0B",
  util:    "#6B7280",
  unknown: "#94A3B8",
};

const nodeTypes = { telos: TelosNode };

export function MapView({ nav, onOpenNode }: { nav: NavigationState; onOpenNode: (id: string) => void }) {
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  const flow = useMemo(
    () => (nav.view ? toFlowGraph(nav.view) : { nodes: [], edges: [] }),
    [nav.view],
  );

  // Layers present in current view.
  const activeLayers = useMemo(
    () => new Set((nav.view?.nodes ?? []).map((n) => n.layer as Layer)),
    [nav.view],
  );

  // Visible layers — all on by default; reset when view changes.
  const [visibleLayers, setVisibleLayers] = useState<Set<Layer>>(() => new Set(LAYER_ORDER));

  // Keep visibleLayers in sync when the view changes (new drill level).
  // If a layer appears that wasn't in the previous set, show it by default.
  const effectiveVisible = useMemo(() => {
    const out = new Set<Layer>();
    for (const l of activeLayers) {
      if (visibleLayers.has(l)) out.add(l);
    }
    return out;
  }, [activeLayers, visibleLayers]);

  const toggleLayer = useCallback((layer: Layer) => {
    setVisibleLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });
  }, []);

  const showAll = useCallback(() => {
    setVisibleLayers(new Set(LAYER_ORDER));
  }, []);

  // Filter nodes by visible layers.
  const filteredNodes = useMemo(
    () => flow.nodes.filter((n) => effectiveVisible.has((n.data as { layer: Layer }).layer)),
    [flow.nodes, effectiveVisible],
  );

  // Filter edges — only keep edges where both endpoints are visible.
  const visibleNodeIds = useMemo(
    () => new Set(filteredNodes.map((n) => n.id)),
    [filteredNodes],
  );

  // Edge styling: weight encoding + hover highlight + layer-filter opacity.
  const edges = useMemo(() => {
    const maxW = Math.max(1, ...flow.edges.map((e) => e.data.weight));
    return flow.edges
      .filter((e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target))
      .map((e) => {
        const w = 1 + 3 * (e.data.weight / maxW);
        const isConnected =
          hoveredNodeId !== null &&
          (e.source === hoveredNodeId || e.target === hoveredNodeId);
        const isAnyHovered = hoveredNodeId !== null;
        return {
          ...e,
          style: {
            stroke: isConnected ? "var(--accent)" : "var(--text-faint)",
            strokeWidth: isConnected ? Math.max(w, 1.5) : w,
            opacity: isAnyHovered && !isConnected ? 0.25 : 1,
            transition: "stroke 120ms ease, opacity 120ms ease",
          },
        };
      });
  }, [flow.edges, visibleNodeIds, hoveredNodeId]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {nav.error && (
        <div
          role="alert"
          style={{
            padding: "var(--s-2) var(--s-4)",
            background: "var(--danger-soft)",
            borderBottom: "1px solid var(--danger)",
            color: "var(--danger)",
            fontSize: "var(--t-body-size)",
            lineHeight: "var(--t-body-lh)",
          }}
        >
          {nav.error}
        </div>
      )}

      <div style={{ position: "relative", flex: 1, background: "var(--bg)" }}>
        {/* Layer filter — interactive toggles replacing the static legend */}
        <LayerFilter
          activeLayers={activeLayers}
          visibleLayers={effectiveVisible}
          onToggle={toggleLayer}
          onShowAll={showAll}
        />

        <ReactFlow
          nodes={filteredNodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          proOptions={{ hideAttribution: true }}
          style={{ background: "var(--bg)" }}
          onNodeClick={(_, node) => {
            const v = nav.view?.nodes.find((x) => x.id === node.id);
            if (!v) return;
            if (v.level === "symbol" || v.level === "file") onOpenNode(v.id);
            else nav.drillInto({ id: v.id, label: v.label, level: v.level });
          }}
          onNodeMouseEnter={(_, node) => setHoveredNodeId(node.id)}
          onNodeMouseLeave={() => setHoveredNodeId(null)}
        >
          <Background variant={BackgroundVariant.Dots} color="var(--border)" gap={24} size={1} />
          <Controls
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-md)",
              boxShadow: "none",
            }}
          />
          <MiniMap
            nodeColor={(node) => {
              const layer = (node.data as { layer?: string }).layer ?? "unknown";
              return LAYER_HEX[layer] ?? LAYER_HEX.unknown;
            }}
            maskColor="rgba(18,24,34,0.7)"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-md)",
            }}
            aria-label="Graph mini-map"
          />
        </ReactFlow>
      </div>

      {nav.loading && (
        <div
          aria-live="polite"
          aria-label="Loading graph"
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "var(--s-3)",
            pointerEvents: "none",
            zIndex: 4,
          }}
        >
          <style>{`
            @keyframes skeletonShimmer {
              0%   { background-position: -400px 0; }
              100% { background-position:  400px 0; }
            }
          `}</style>
          {[180, 240, 200].map((w, i) => (
            <div
              key={i}
              style={{
                width: w,
                height: 52,
                borderRadius: "var(--r-md)",
                background: "var(--surface-2)",
                backgroundImage:
                  "linear-gradient(90deg, var(--surface-2) 0%, var(--surface) 50%, var(--surface-2) 100%)",
                backgroundSize: "800px 100%",
                animation: "skeletonShimmer 1.4s ease-in-out infinite",
                opacity: 0.7 - i * 0.15,
              }}
            />
          ))}
        </div>
      )}

      {!nav.loading && nav.view && nav.view.nodes.length === 0 && (
        <div
          role="status"
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            gap: "var(--s-2)",
          }}
        >
          <span aria-hidden="true" style={{ color: "var(--text-faint)", fontSize: 28, lineHeight: 1, marginBottom: "var(--s-1)" }}>◇</span>
          <div style={{ color: "var(--text-muted)", fontSize: "var(--t-body-size)", lineHeight: "var(--t-body-lh)" }}>No graph data yet</div>
          <div style={{ color: "var(--text-faint)", fontSize: "var(--t-meta-size)", lineHeight: "var(--t-meta-lh)", fontFamily: "var(--font-mono)" }}>
            Run <code>telos scan</code> to build the map
          </div>
        </div>
      )}
    </div>
  );
}

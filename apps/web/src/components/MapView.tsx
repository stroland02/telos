import { useMemo, useState } from "react";
import { ReactFlow, Background, BackgroundVariant, Controls } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { NavigationState } from "../graph/useNavigation";
import { toFlowGraph } from "../graph/layout";
import { TelosNode } from "./TelosNode";
import { LayerLegend } from "./LayerLegend";
import type { Layer } from "../api/types";

const nodeTypes = { telos: TelosNode };

export function MapView({ nav, onOpenNode }: { nav: NavigationState; onOpenNode: (id: string) => void }) {
  // Track the hovered node ID to drive edge highlight/dim effect.
  // null = no hover (all edges at normal opacity).
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  const flow = useMemo(
    () => (nav.view ? toFlowGraph(nav.view) : { nodes: [], edges: [] }),
    [nav.view],
  );

  // Derive the set of layers actually present in this view for the legend.
  const activeLayers = useMemo(
    () => new Set((nav.view?.nodes ?? []).map((n) => n.layer as Layer)),
    [nav.view],
  );

  // Edge thickness encodes call-traffic weight (node-link visual-language
  // convention: link "size" ∝ flow magnitude), normalized to a 1–4px range.
  // On node hover: edges connected to the hovered node become --accent (cyan),
  // unconnected edges dim to low opacity — instantly revealing the dependency
  // subgraph. No re-layout; pure style update. (xyflow discussion #4496)
  const edges = useMemo(() => {
    const maxW = Math.max(1, ...flow.edges.map((e) => e.data.weight));
    return flow.edges.map((e) => {
      const w = 1 + 3 * (e.data.weight / maxW);
      const isConnected =
        hoveredNodeId !== null &&
        (e.source === hoveredNodeId || e.target === hoveredNodeId);
      const isAnyHovered = hoveredNodeId !== null;
      return {
        ...e,
        style: {
          stroke: isConnected
            ? "var(--accent)"
            : "var(--text-faint)",
          strokeWidth: isConnected ? Math.max(w, 1.5) : w,
          opacity: isAnyHovered && !isConnected ? 0.25 : 1,
          transition: "stroke 120ms ease, opacity 120ms ease",
        },
      };
    });
  }, [flow.edges, hoveredNodeId]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Error banner */}
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

      {/* Canvas — full-bleed */}
      <div style={{ position: "relative", flex: 1, background: "var(--bg)" }}>
        <LayerLegend activeLayers={activeLayers} />
        <ReactFlow
          nodes={flow.nodes}
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
          <Background
            variant={BackgroundVariant.Dots}
            color="var(--border)"
            gap={24}
            size={1}
          />
          <Controls
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-md)",
              boxShadow: "none",
            }}
          />
        </ReactFlow>
      </div>

      {/* Loading overlay — calm skeleton shimmer while fetching a level.
          Respects reduced-motion: animation is suppressed by the global guard
          in tokens.css; the static placeholder remains visible. */}
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

      {/* Empty/no-data state */}
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
          {/* Sentinel diamond — quiet visual anchor */}
          <span
            aria-hidden="true"
            style={{
              color: "var(--text-faint)",
              fontSize: 28,
              lineHeight: 1,
              marginBottom: "var(--s-1)",
            }}
          >
            ◇
          </span>
          <div
            style={{
              color: "var(--text-muted)",
              fontSize: "var(--t-body-size)",
              lineHeight: "var(--t-body-lh)",
            }}
          >
            No graph data yet
          </div>
          <div
            style={{
              color: "var(--text-faint)",
              fontSize: "var(--t-meta-size)",
              lineHeight: "var(--t-meta-lh)",
              fontFamily: "var(--font-mono)",
            }}
          >
            Run <code>telos scan</code> to build the map
          </div>
        </div>
      )}
    </div>
  );
}

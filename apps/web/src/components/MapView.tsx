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

      {/* Empty/no-data state */}
      {!nav.loading && nav.view && nav.view.nodes.length === 0 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            color: "var(--text-faint)",
            fontSize: "var(--t-body-size)",
            lineHeight: "var(--t-body-lh)",
          }}
        >
          Run <code style={{ fontFamily: "var(--font-mono)", margin: "0 var(--s-1)" }}>telos scan</code> to build the map
        </div>
      )}
    </div>
  );
}

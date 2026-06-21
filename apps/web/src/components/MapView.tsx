import { useMemo } from "react";
import { ReactFlow, Background, BackgroundVariant, Controls } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { NavigationState } from "../graph/useNavigation";
import { toFlowGraph } from "../graph/layout";
import { TelosNode } from "./TelosNode";

const nodeTypes = { telos: TelosNode };

export function MapView({ nav, onOpenNode }: { nav: NavigationState; onOpenNode: (id: string) => void }) {
  const flow = useMemo(
    () => (nav.view ? toFlowGraph(nav.view) : { nodes: [], edges: [] }),
    [nav.view],
  );

  // Edge thickness encodes call-traffic weight (node-link visual-language
  // convention: link "size" ∝ flow magnitude), normalized to a 1–4px range.
  const edges = useMemo(() => {
    const maxW = Math.max(1, ...flow.edges.map((e) => e.data.weight));
    return flow.edges.map((e) => ({
      ...e,
      style: { stroke: "var(--text-faint)", strokeWidth: 1 + 3 * (e.data.weight / maxW) },
    }));
  }, [flow.edges]);

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

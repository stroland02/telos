import { useMemo, useState } from "react";
import { ReactFlow, Background, BackgroundVariant, Controls } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { TelosApi } from "../api/client";
import { NodeDetail } from "../api/types";
import { useNavigation } from "../graph/useNavigation";
import { toFlowGraph } from "../graph/layout";
import { TelosNode } from "./TelosNode";
import { Breadcrumbs } from "./Breadcrumbs";
import { SearchBox } from "./SearchBox";
import { DetailPanel } from "./DetailPanel";

const nodeTypes = { telos: TelosNode };

export function MapView({ api }: { api: TelosApi }) {
  const nav = useNavigation(api);
  const [detail, setDetail] = useState<NodeDetail | null>(null);

  const flow = useMemo(
    () => (nav.view ? toFlowGraph(nav.view) : { nodes: [], edges: [] }),
    [nav.view],
  );

  const openNode = (id: string) => {
    void api.node(id).then((d) => { if (d) setDetail(d); });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Error banner */}
      {nav.error && (
        <div
          role="alert"
          style={{
            padding: "var(--s-2) var(--s-4)",
            background: "rgba(185,28,28,0.15)",
            borderBottom: "1px solid rgba(185,28,28,0.4)",
            color: "#fca5a5",
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
          edges={flow.edges}
          nodeTypes={nodeTypes}
          fitView
          style={{ background: "var(--bg)" }}
          onNodeClick={(_, node) => {
            const v = nav.view?.nodes.find((x) => x.id === node.id);
            if (!v) return;
            if (v.level === "symbol" || v.level === "file") openNode(v.id);
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

        {/* Detail panel overlays the canvas from the right */}
        <DetailPanel detail={detail} onClose={() => setDetail(null)} />
      </div>

      {/* Breadcrumbs + search live in the top bar (rendered by App), so
          we expose them here for MapView-level composition tests. */}
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

// Re-export sub-components so App can compose them in the top bar
export { Breadcrumbs, SearchBox };
export type { NodeDetail };

import { useMemo, useState, useCallback } from "react";
import { ReactFlow, Background, BackgroundVariant, Controls, MiniMap } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { NavigationState } from "../graph/useNavigation";
import { toFlowGraph } from "../graph/layout";
import { TelosNode } from "./TelosNode";
import { LayerFilter, LAYER_ORDER } from "./LayerFilter";
import { PathFinderBar, PATH_FINDER_IDLE, bfsPath } from "./PathFinder";
import type { PathFinderState } from "./PathFinder";
import type { Layer } from "../api/types";

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
  const [pfState, setPfState] = useState<PathFinderState>(PATH_FINDER_IDLE);

  const flow = useMemo(
    () => (nav.view ? toFlowGraph(nav.view) : { nodes: [], edges: [] }),
    [nav.view],
  );

  const activeLayers = useMemo(
    () => new Set((nav.view?.nodes ?? []).map((n) => n.layer as Layer)),
    [nav.view],
  );

  const [visibleLayers, setVisibleLayers] = useState<Set<Layer>>(() => new Set(LAYER_ORDER));

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
      if (next.has(layer)) next.delete(layer); else next.add(layer);
      return next;
    });
  }, []);

  const showAll = useCallback(() => setVisibleLayers(new Set(LAYER_ORDER)), []);

  const filteredNodes = useMemo(
    () => flow.nodes.filter((n) => effectiveVisible.has((n.data as { layer: Layer }).layer)),
    [flow.nodes, effectiveVisible],
  );

  const visibleNodeIds = useMemo(() => new Set(filteredNodes.map((n) => n.id)), [filteredNodes]);

  // Path-finder sets of highlighted node/edge IDs.
  const pathNodeSet = useMemo(() => new Set(pfState.path ?? []), [pfState.path]);
  const pathEdgeSet = useMemo(() => {
    if (!pfState.path || pfState.path.length < 2) return new Set<string>();
    const s = new Set<string>();
    for (let i = 0; i < pfState.path.length - 1; i++) {
      s.add(`${pfState.path[i]}->${pfState.path[i + 1]}`);
    }
    return s;
  }, [pfState.path]);

  const isPathActive = pfState.path !== null && pfState.path.length > 0;

  const edges = useMemo(() => {
    const maxW = Math.max(1, ...flow.edges.map((e) => e.data.weight));
    return flow.edges
      .filter((e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target))
      .map((e) => {
        const w = 1 + 3 * (e.data.weight / maxW);
        const onPath = pathEdgeSet.has(e.id);
        const isConnected =
          !isPathActive && hoveredNodeId !== null &&
          (e.source === hoveredNodeId || e.target === hoveredNodeId);
        const isAnyHovered = !isPathActive && hoveredNodeId !== null;
        return {
          ...e,
          style: {
            stroke: onPath ? "var(--accent)" : isConnected ? "var(--accent)" : "var(--text-faint)",
            strokeWidth: onPath ? Math.max(w, 2) : isConnected ? Math.max(w, 1.5) : w,
            opacity: isPathActive
              ? onPath ? 1 : 0.1
              : isAnyHovered && !isConnected ? 0.25 : 1,
            transition: "stroke 120ms ease, opacity 120ms ease",
          },
        };
      });
  }, [flow.edges, visibleNodeIds, hoveredNodeId, pathEdgeSet, isPathActive]);

  // Nodes with path-aware styling injected into data.
  const styledNodes = useMemo(
    () =>
      filteredNodes.map((n) => ({
        ...n,
        data: {
          ...n.data,
          _pathOn: isPathActive ? pathNodeSet.has(n.id) : null,
          _pathDim: isPathActive ? !pathNodeSet.has(n.id) : false,
        },
      })),
    [filteredNodes, pathNodeSet, isPathActive],
  );

  // Source node label for PathFinderBar prompt.
  const sourceLabel = useMemo(() => {
    if (!pfState.sourceId) return undefined;
    const n = flow.nodes.find((x) => x.id === pfState.sourceId);
    return (n?.data as { label?: string })?.label;
  }, [pfState.sourceId, flow.nodes]);

  const handleNodeClick = useCallback(
    (_: unknown, node: { id: string }) => {
      const v = nav.view?.nodes.find((x) => x.id === node.id);
      if (!v) return;

      // Path-finder intercepts clicks when active.
      if (pfState.active) {
        if (!pfState.sourceId) {
          // Step 1: pick source.
          setPfState((s) => ({ ...s, sourceId: node.id }));
          return;
        }
        // Step 2: pick target → run BFS.
        const rawEdges = flow.edges.map((e) => ({ source: e.source, target: e.target }));
        const path = bfsPath(pfState.sourceId, node.id, rawEdges);
        setPfState((s) => ({
          ...s,
          active: false,
          path: path ?? null,
          noPath: path === null,
        }));
        return;
      }

      // Normal navigation.
      if (v.level === "symbol" || v.level === "file") onOpenNode(v.id);
      else nav.drillInto({ id: v.id, label: v.label, level: v.level });
    },
    [nav, pfState, flow.edges, onOpenNode],
  );

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
        <LayerFilter
          activeLayers={activeLayers}
          visibleLayers={effectiveVisible}
          onToggle={toggleLayer}
          onShowAll={showAll}
        />

        {/* Path-finder control bar — centered top */}
        <PathFinderBar
          state={pfState}
          onActivate={() => setPfState({ active: true, sourceId: null, path: null, noPath: false })}
          onReset={() => setPfState(PATH_FINDER_IDLE)}
          sourceLabel={sourceLabel}
        />

        <ReactFlow
          nodes={styledNodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          proOptions={{ hideAttribution: true }}
          style={{ background: "var(--bg)", cursor: pfState.active ? "crosshair" : undefined }}
          onNodeClick={handleNodeClick}
          onNodeMouseEnter={(_, node) => { if (!pfState.active) setHoveredNodeId(node.id); }}
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
                backgroundImage: "linear-gradient(90deg, var(--surface-2) 0%, var(--surface) 50%, var(--surface-2) 100%)",
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

import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { ReactFlow, Background, BackgroundVariant, Controls, MiniMap, Panel } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { NavigationState } from "../graph/useNavigation";
import { toFlowGraph } from "../graph/layout";
import { TelosNode, setCurrentDensity } from "./TelosNode";
import { LayerFilter, LAYER_ORDER } from "./LayerFilter";
import { PathFinderBar, PATH_FINDER_IDLE, bfsPath } from "./PathFinder";
import type { PathFinderState } from "./PathFinder";
import { ExportButton } from "./ExportButton";
import { TourBar } from "./TourBar";
import type { Layer, GraphView } from "../api/types";
import type { TelosApi } from "../api/client";
import type { DensityMode } from "../graph/useDensity";

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

export function MapView({ nav, api, density, theme, onOpenNode }: { nav: NavigationState; api: TelosApi; density: DensityMode; theme?: string; onOpenNode: (id: string) => void }) {
  // Sync module-level density ref so TelosNode reads it on each render.
  setCurrentDensity(density);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Resolve MiniMap color tokens from CSS custom properties at render time.
  // React Flow's MiniMap accepts literal color strings (SVG fill), not CSS vars,
  // so we read the computed values off <html> on every render — cheap and ensures
  // MiniMap responds to theme switches without a separate state update.
  const minimapBg = useMemo(() => {
    if (typeof document === "undefined") return "#121822";
    return getComputedStyle(document.documentElement)
      .getPropertyValue("--minimap-bg").trim() || "#121822";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]); // re-resolve when theme changes

  const minimapMask = useMemo(() => {
    if (typeof document === "undefined") return "rgba(11,15,20,0.60)";
    return getComputedStyle(document.documentElement)
      .getPropertyValue("--minimap-mask").trim() || "rgba(11,15,20,0.60)";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);
  const [pfState, setPfState] = useState<PathFinderState>(PATH_FINDER_IDLE);
  const [tourActive, setTourActive] = useState(false);

  // Granularity toggle: "Files" vs "Files + Symbols"
  // Only active when the current level contains file nodes.
  const hasFileNodes = useMemo(
    () => (nav.view?.nodes ?? []).some((n) => n.level === "file"),
    [nav.view],
  );
  const [showSymbols, setShowSymbols] = useState(false);
  // Reset toggle when navigating to a level without file nodes
  useEffect(() => { if (!hasFileNodes) setShowSymbols(false); }, [hasFileNodes]);
  // Reset tour when the view changes (new level drilled into)
  useEffect(() => { setTourActive(false); }, [nav.view]);

  // When showSymbols is on, fetch symbol children for every file node in the view.
  const [symbolView, setSymbolView] = useState<GraphView | null>(null);
  useEffect(() => {
    if (!showSymbols || !hasFileNodes || !nav.view) { setSymbolView(null); return; }
    const fileIds = nav.view.nodes.filter((n) => n.level === "file").map((n) => n.id);
    Promise.all(fileIds.map((id) => api.cluster(id))).then((views) => {
      const symNodes = views.flatMap((v) => v?.nodes ?? []);
      setSymbolView({ nodes: symNodes, edges: [] });
    }).catch(() => setSymbolView(null));
  }, [showSymbols, hasFileNodes, nav.view, api]);

  // Merge symbol children into the view when granularity is expanded.
  const activeView = useMemo(() => {
    if (!nav.view) return null;
    if (showSymbols && symbolView && symbolView.nodes.length > 0) {
      // De-duplicate: symbols from symbolView that aren't already in nav.view
      const existingIds = new Set(nav.view.nodes.map((n) => n.id));
      const newNodes = symbolView.nodes.filter((n) => !existingIds.has(n.id));
      return { nodes: [...nav.view.nodes, ...newNodes], edges: nav.view.edges };
    }
    return nav.view;
  }, [nav.view, showSymbols, symbolView]);

  const flow = useMemo(
    () => (activeView ? toFlowGraph(activeView) : { nodes: [], edges: [] }),
    [activeView],
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

        {/* Granularity toggle — appears only at file level and when path-finder is idle.
            Positioned top-left (inside ReactFlow via absolute, clear of PathFinderBar center). */}
        {hasFileNodes && !pfState.active && pfState.path === null && (
          <div
            style={{
              position: "absolute",
              top: "var(--s-2)",
              left: "var(--s-2)",
              display: "flex",
              gap: 0,
              zIndex: 5,
              pointerEvents: "auto",
            }}
          >
            <button
              onClick={() => setShowSymbols(false)}
              aria-pressed={!showSymbols}
              title="Show file nodes only"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--t-meta-size)",
                lineHeight: "var(--t-meta-lh)",
                padding: "var(--s-1) var(--s-3)",
                background: !showSymbols ? "var(--accent-soft)" : "var(--surface)",
                border: `1px solid ${!showSymbols ? "var(--accent)" : "var(--border)"}`,
                borderRadius: "var(--r-sm) 0 0 var(--r-sm)",
                color: !showSymbols ? "var(--accent)" : "var(--text-muted)",
                cursor: "pointer",
                outline: "none",
                transition: "background 120ms ease, color 120ms ease, border-color 120ms ease",
                whiteSpace: "nowrap",
              }}
              onFocus={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "0 0 0 2px var(--accent)"; }}
              onBlur={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}
            >
              Files
            </button>
            <button
              onClick={() => setShowSymbols(true)}
              aria-pressed={showSymbols}
              title="Expand symbols within each file"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--t-meta-size)",
                lineHeight: "var(--t-meta-lh)",
                padding: "var(--s-1) var(--s-3)",
                background: showSymbols ? "var(--accent-soft)" : "var(--surface)",
                border: `1px solid ${showSymbols ? "var(--accent)" : "var(--border)"}`,
                borderLeft: "none",
                borderRadius: "0 var(--r-sm) var(--r-sm) 0",
                color: showSymbols ? "var(--accent)" : "var(--text-muted)",
                cursor: "pointer",
                outline: "none",
                transition: "background 120ms ease, color 120ms ease, border-color 120ms ease",
                whiteSpace: "nowrap",
              }}
              onFocus={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "0 0 0 2px var(--accent)"; }}
              onBlur={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}
            >
              +Symbols
            </button>
          </div>
        )}

        {/* Path-finder control bar — centered top.
            When the TourBar is active it occupies the top-right panel (~56px tall);
            offset PathFinderBar down so the two bars never sit on the same row. */}
        <PathFinderBar
          state={pfState}
          onActivate={() => setPfState({ active: true, sourceId: null, path: null, noPath: false })}
          onReset={() => setPfState(PATH_FINDER_IDLE)}
          sourceLabel={sourceLabel}
          topOffset={tourActive ? 64 : 0}
        />

        <ReactFlow
          nodes={styledNodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{
            // padding: generous 30% so a single node sits centered in space,
            // not edge-to-edge. maxZoom 1.2 prevents over-zoom on small clusters
            // (1–3 nodes). Reference: xyflow.com/docs fitViewOptions.
            padding: 0.30,
            maxZoom: 1.2,
          }}
          proOptions={{ hideAttribution: true }}
          style={{ background: "var(--bg)", cursor: pfState.active ? "crosshair" : undefined }}
          onNodeClick={handleNodeClick}
          onNodeMouseEnter={(_, node) => { if (!pfState.active) setHoveredNodeId(node.id); }}
          onNodeMouseLeave={() => setHoveredNodeId(null)}
        >
          <Background variant={BackgroundVariant.Dots} color="var(--border)" gap={24} size={1} />
          <Controls
            position="bottom-center"
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
            nodeStrokeColor="transparent"
            nodeStrokeWidth={0}
            maskColor={minimapMask}
            bgColor={minimapBg}
            style={{
              background: minimapBg,
              border: "1px solid var(--border)",
              borderRadius: "var(--r-md)",
            }}
            aria-label="Graph mini-map"
          />
          {/* Export button — Panel keeps it inside the ReactFlow provider context */}
          <Panel position="top-right" style={{ margin: "var(--s-2)", display: "flex", gap: "var(--s-2)", alignItems: "center" }}>
            <TourBar
              nodes={filteredNodes}
              active={tourActive}
              onActivate={() => setTourActive(true)}
              onClose={() => setTourActive(false)}
            />
            <ExportButton graphView={nav.view ?? null} />
          </Panel>
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

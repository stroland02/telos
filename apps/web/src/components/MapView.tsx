import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { ReactFlow, Background, BackgroundVariant, Controls, MiniMap, Panel, useReactFlow, useStore } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { NavigationState } from "../graph/useNavigation";
import { toFlowGraph } from "../graph/layout";
import { TelosNode, setCurrentDensity } from "./TelosNode";
import { LayerFilter, LAYER_ORDER } from "./LayerFilter";
import { PathFinderBar, PATH_FINDER_IDLE, bfsPath } from "./PathFinder";
import type { PathFinderState } from "./PathFinder";
import { ExportButton } from "./ExportButton";
import { TourBar } from "./TourBar";
import type { Layer, GraphView, ForgeState } from "../api/types";
import type { TelosApi } from "../api/client";
import type { DensityMode } from "../graph/useDensity";
import type { TraceOverlay } from "../graph/useTraceOverlay";

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

// Inner component inside <ReactFlow> provider — handles all fitView logic.
//
// PROBLEM: RF's built-in fitView() reads its internal store dimensions (s.width,
// s.height) which are updated by RF's own ResizeObserver. When the CodeViewer
// opens and the flex layout shrinks the map column, RF's store may still hold
// the pre-resize dimensions at the moment fitView() fires, producing a stale
// scale/translate. Even forcing it via timeouts doesn't reliably fix this because
// RF's ResizeObserver callback and our setTimeout race each other.
//
// SOLUTION: Skip fitView() entirely. Instead use setViewport() with dimensions
// read directly from the DOM via getBoundingClientRect() on the RF container.
// DOM measurements are always current — they reflect the post-paint layout. We
// manually compute the correct scale and translate from node bounds + container
// size and set the viewport directly, bypassing RF's internal measurement path.
function FitViewRegistrar({ registerFitView }: { registerFitView?: (fn: () => void) => void }) {
  const { getNodes, setViewport } = useReactFlow();

  const fit = useCallback(() => {
    // Read actual container size from DOM — always correct, even post-flex-resize.
    const rfEl = document.querySelector<HTMLElement>('.react-flow');
    if (!rfEl) return;
    const { width: containerW, height: containerH } = rfEl.getBoundingClientRect();
    if (!containerW || !containerH) return;

    const nodes = getNodes();
    if (!nodes.length) return;

    const PADDING = 0.25; // 25% margin around the graph bounds

    // Compute bounding box of all nodes using their measured dimensions.
    // RF stores measured width/height on the node object after its layout pass.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      const nw = n.measured?.width ?? (n as { width?: number }).width ?? 200;
      const nh = n.measured?.height ?? (n as { height?: number }).height ?? 80;
      if (n.position.x < minX) minX = n.position.x;
      if (n.position.y < minY) minY = n.position.y;
      if (n.position.x + nw > maxX) maxX = n.position.x + nw;
      if (n.position.y + nh > maxY) maxY = n.position.y + nh;
    }

    const graphW = maxX - minX;
    const graphH = maxY - minY;
    if (!graphW || !graphH) return;

    // Scale that fits the graph into the container with the requested padding.
    const scaleX = (containerW * (1 - PADDING * 2)) / graphW;
    const scaleY = (containerH * (1 - PADDING * 2)) / graphH;
    const zoom = Math.min(scaleX, scaleY, 1.5); // cap at 1.5× zoom

    // Center the graph in the container at this zoom level.
    const x = (containerW - graphW * zoom) / 2 - minX * zoom;
    const y = (containerH - graphH * zoom) / 2 - minY * zoom;

    setViewport({ x, y, zoom }, { duration: 200 });
  }, [getNodes, setViewport]);

  // Register with parent so App-level layout changes can call fit too.
  useEffect(() => { registerFitView?.(fit); }, [fit, registerFitView]);

  // Watch RF's internal store dimensions. RF updates these after its own
  // ResizeObserver fires. When they change we call fit() — but our fit()
  // reads the DOM directly so it always uses the correct post-resize size.
  const rfWidth  = useStore((s) => s.width);
  const rfHeight = useStore((s) => s.height);
  useEffect(() => {
    if (!rfWidth || !rfHeight) return;
    // Tiny delay lets the DOM settle after RF's resize processing
    const tid = setTimeout(fit, 16);
    return () => clearTimeout(tid);
  }, [rfWidth, rfHeight]);

  return null;
}

// Reads RF's internal viewport width from the store and reports it via callback.
// Used to conditionally show/hide elements (e.g. MiniMap) based on available space.
function WidthReader({ onWidth }: { onWidth: (w: number) => void }) {
  const rfWidth = useStore((s) => s.width);
  useEffect(() => { if (rfWidth) onWidth(rfWidth); }, [rfWidth, onWidth]);
  return null;
}

// Minimum map column width below which the minimap is hidden to save space.
const MINIMAP_MIN_WIDTH = 380;

export function MapView({ nav, api, density, theme, onOpenNode, registerFitView, layoutKey, trace, replayNodeId, hotIntensity, forge, tourActive, onTourClose, registerExport, showSymbols = false }: { nav: NavigationState; api: TelosApi; density: DensityMode; theme?: string; onOpenNode: (id: string) => void; registerFitView?: (fn: () => void) => void; layoutKey?: string; trace?: TraceOverlay; replayNodeId?: string | null; hotIntensity?: (nodeId: string) => number; forge?: ForgeState | null; tourActive?: boolean; onTourClose?: () => void; registerExport?: (a: { exportSvg: () => void; exportJson: () => void }) => void; showSymbols?: boolean }) {
  // Sync module-level density ref so TelosNode reads it on each render.
  setCurrentDensity(density);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Track the RF container width so we can hide the minimap when too narrow.
  const [mapColumnWidth, setMapColumnWidth] = useState(700);
  const showMinimap = mapColumnWidth >= MINIMAP_MIN_WIDTH;

  // Resolve MiniMap color tokens from CSS custom properties at render time.
  // React Flow's MiniMap accepts literal color strings (SVG fill), not CSS vars,
  // so we read the computed values off <html> on every render — cheap and ensures
  // MiniMap responds to theme switches without a separate state update.
  const minimapBg = useMemo(() => {
    if (typeof document === "undefined") return "#121822";
    return getComputedStyle(document.documentElement)
      .getPropertyValue("--minimap-bg").trim() || "#121822";
  }, [theme]); // re-resolve when theme changes

  const minimapMask = useMemo(() => {
    if (typeof document === "undefined") return "rgba(11,15,20,0.60)";
    return getComputedStyle(document.documentElement)
      .getPropertyValue("--minimap-mask").trim() || "rgba(11,15,20,0.60)";
  }, [theme]); // re-resolve when theme changes
  const [pfState, setPfState] = useState<PathFinderState>(PATH_FINDER_IDLE);

  // Granularity toggle: "Files" vs "Files + Symbols"
  // Only active when the current level contains file nodes.
  const hasFileNodes = useMemo(
    () => (nav.view?.nodes ?? []).some((n) => n.level === "file"),
    [nav.view],
  );

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
        // Live trace overlay: edges carrying recent traffic pulse and glow.
        const live = trace?.edgeSignal(e.source, e.target);
        const isLive = !!live && live.calls > 0;
        const liveErr = !!live && live.errors > 0;
        const liveStroke = liveErr ? "var(--danger)" : "var(--accent)";
        return {
          ...e,
          animated: isLive && !isPathActive,
          style: {
            stroke: onPath ? "var(--accent)" : isConnected ? "var(--accent)" : isLive ? liveStroke : "var(--text-faint)",
            strokeWidth: onPath ? Math.max(w, 2) : isConnected ? Math.max(w, 1.5) : isLive ? Math.max(w, 2) : w,
            opacity: isPathActive
              ? onPath ? 1 : 0.1
              : isAnyHovered && !isConnected ? 0.25 : 1,
            transition: "stroke 120ms ease, opacity 120ms ease",
          },
        };
      });
  }, [flow.edges, visibleNodeIds, hoveredNodeId, pathEdgeSet, isPathActive, trace]);

  // Nodes with path-aware styling injected into data.
  const styledNodes = useMemo(
    () =>
      filteredNodes.map((n) => {
        const sig = trace?.nodeSignal(n.id);
        return {
          ...n,
          data: {
            ...n.data,
            _pathOn: isPathActive ? pathNodeSet.has(n.id) : null,
            _pathDim: isPathActive ? !pathNodeSet.has(n.id) : false,
            _liveCalls: sig?.calls ?? 0,
            _liveErr: (sig?.errors ?? 0) > 0,
            _replayOn: replayNodeId != null && n.id === replayNodeId,
            _hot: hotIntensity ? hotIntensity(n.id) : 0,
            _forgeAdded: forge?.diff.added.nodes.includes(n.id) ?? false,
            _forgeChanged: forge?.diff.changed.includes(n.id) ?? false,
            _forgeRemoved: forge?.diff.removed.nodes.includes(n.id) ?? false,
          },
        };
      }),
    [filteredNodes, pathNodeSet, isPathActive, trace, replayNodeId, hotIntensity, forge],
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

  const fitViewCallbackRef = useRef<(() => void) | null>(null);

  // Store the fit fn when FitViewRegistrar registers it
  const handleRegisterFitView = useCallback((fn: () => void) => {
    fitViewCallbackRef.current = fn;
    registerFitView?.(fn);
  }, [registerFitView]);



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

      {/* Map canvas — all floating controls live inside RF Panels so they clip
          to the RF boundary and never overlap each other or bleed outside. */}
      <div style={{ position: "relative", flex: 1, background: "var(--bg)" }}>
        <ReactFlow
          key={layoutKey}
          nodes={styledNodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitViewOptions={{
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

          {/* Zoom controls — bottom-center; 16px bottom inset (uniform with
              the layer filter and mini-map so all three baselines align). */}
          <Controls
            position="bottom-right"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-md)",
              boxShadow: "none",
              marginBottom: "var(--s-4)",
              marginRight: showMinimap ? 224 : "var(--s-4)", // sit just left of the mini-map
            }}
          />

          {/* Minimap — bottom-right, hidden when map column is too narrow (<380px) */}
          {showMinimap && (
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
                margin: "var(--s-4)",
              }}
              aria-label="Graph mini-map"
            />
          )}

          {/* FitView registrar + width reader — invisible inner components */}
          <FitViewRegistrar registerFitView={handleRegisterFitView} />
          <WidthReader onWidth={setMapColumnWidth} />

          {/* ── Top-left panel: Find-path + granularity toggle ─────────────
              Stacked vertically with consistent 8px gap. Both controls share
              one Panel so they're anchored together and never overlap the
              top-right panel regardless of how narrow the map column gets. */}
          <Panel position="top-left" style={{ margin: "var(--s-2)", display: "flex", flexDirection: "column", gap: "var(--s-2)", alignItems: "flex-start" }}>
            {/* Path-finder control bar */}
            <PathFinderBar
              state={pfState}
              onActivate={() => setPfState({ active: true, sourceId: null, path: null, noPath: false })}
              onReset={() => setPfState(PATH_FINDER_IDLE)}
              sourceLabel={sourceLabel}
            />
          </Panel>

          {/* ── Top-right panel: Tour + Export ─────────────────────────────
              Anchored to top-right, 8px margin. Never overlaps top-left panel
              because RF Panels each sit in their own corner. */}
          {tourActive && (
            <Panel position="bottom-center" style={{ margin: "var(--s-4)" }}>
              <TourBar
                nodes={filteredNodes}
                active
                onActivate={() => {}}
                onClose={() => onTourClose?.()}
              />
            </Panel>
          )}
          {/* Headless: registers SVG/JSON export actions up to the rail. */}
          <ExportButton graphView={nav.view ?? null} headless onReady={registerExport} />

          {/* ── Bottom-left panel: Layer filter ────────────────────────────
              Moved inside RF Panel so it clips to the RF boundary. */}
          <Panel position="bottom-left" style={{ margin: "var(--s-4)" }}>
            <LayerFilter
              activeLayers={activeLayers}
              visibleLayers={effectiveVisible}
              onToggle={toggleLayer}
              onShowAll={showAll}
            />
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

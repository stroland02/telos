import { useState, useCallback, useEffect, useRef } from "react";
import { createApi } from "./api/client";
import { NodeDetail, SourceResult, TelosNodeDTO, Recommendation, LogLine, MetricSeries } from "./api/types";
import { useNavigation } from "./graph/useNavigation";
import { useTraceOverlay } from "./graph/useTraceOverlay";
import { useTracePlayback } from "./graph/useTracePlayback";
import { useProfileOverlay } from "./graph/useProfileOverlay";
import { useForgeOverlay } from "./graph/useForgeOverlay";
import { useDensity } from "./graph/useDensity";
import type { DensityMode } from "./graph/useDensity";
import { useTheme } from "./graph/useTheme";
import { MapView } from "./components/MapView";
import { Breadcrumbs } from "./components/Breadcrumbs";
import { FileTree } from "./components/FileTree";
import { DetailPanel } from "./components/DetailPanel";
import { ShortcutsOverlay } from "./components/ShortcutsOverlay";
import { CodeViewer } from "./components/CodeViewer";
import { AskPanel } from "./components/AskPanel";
import { ProcessPanel } from "./components/ProcessPanel";
import { HarnessPanel } from "./components/HarnessPanel";
import { ContextPanel } from "./components/ContextPanel";
import { ControlRail } from "./components/ControlRail";
import { useTelosStatus } from "./graph/useTelosStatus";

const api = createApi();

const SIDEBAR_WIDTH = 260;
const RIGHT_PANE_DEFAULT = Math.min(Math.round(window.innerWidth * 0.40), 600);
const RIGHT_PANE_MIN = 340;
const RIGHT_PANE_MAX = Math.round(window.innerWidth * 0.72);
// The map must never be squeezed below this — the code pane yields first.
const MAP_MIN_WIDTH = 320;
const LS_KEY = "telos:rightPaneWidth";

function loadRightWidth(): number {
  try {
    const v = localStorage.getItem(LS_KEY);
    if (v) {
      const n = parseInt(v, 10);
      if (n >= RIGHT_PANE_MIN && n <= RIGHT_PANE_MAX) return n;
    }
  } catch { /* ignore */ }
  return RIGHT_PANE_DEFAULT;
}

export function App() {
  const nav = useNavigation(api);
  const { mode: density, setMode: setDensity } = useDensity();
  const { theme, toggle: toggleTheme } = useTheme();
  const [detail, setDetail] = useState<NodeDetail | null>(null);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [metrics, setMetrics] = useState<MetricSeries[]>([]);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [procsOpen, setProcsOpen] = useState(false);
  const [harnessOpen, setHarnessOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [tourActive, setTourActive] = useState(false);
  const [showSymbols, setShowSymbols] = useState(false);
  const [engaged, setEngaged] = useState(false);
  const exportRef = useRef<{ exportSvg: () => void; exportJson: () => void } | null>(null);
  const registerExport = useCallback((a: { exportSvg: () => void; exportJson: () => void }) => { exportRef.current = a; }, []);
  const [railCollapsed, setRailCollapsed] = useState(() => {
    try { return localStorage.getItem("telos.rail.collapsed") === "1"; } catch { return false; }
  });
  const status = useTelosStatus(api);
  const [liveOn, setLiveOn] = useState(false);
  const trace = useTraceOverlay(api, liveOn);
  const playback = useTracePlayback(api);
  const [hotOn, setHotOn] = useState(false);
  const profile = useProfileOverlay(api, hotOn);
  const { forge } = useForgeOverlay(api);

  const onReplay = useCallback(async () => {
    if (playback.playing) { playback.stop(); return; }
    try {
      const recent = await api.recentTraces(1);
      if (recent[0]) await playback.play(recent[0].traceId);
    } catch { /* no traces yet — non-fatal */ }
  }, [playback]);

  // ── File explorer state ──────────────────────────────────────────────────
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [filePaths, setFilePaths] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [sourceResult, setSourceResult] = useState<SourceResult | null>(null);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);

  // ── Right pane width (resizable splitter) ───────────────────────────────
  const [rightWidth, setRightWidth] = useState<number>(loadRightWidth);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  // Persist width changes
  useEffect(() => {
    try { localStorage.setItem(LS_KEY, String(rightWidth)); } catch { /* ignore */ }
  }, [rightWidth]);

  // ── fitView callback: MapView exposes this so we can call it on resize ──
  const fitViewRef = useRef<(() => void) | null>(null);
  const registerFitView = useCallback((fn: () => void) => {
    fitViewRef.current = fn;
  }, []);

  // Load file list once on mount
  useEffect(() => {
    api.files().then(setFilePaths).catch(() => {/* non-fatal */});
  }, []);

  const openFile = useCallback((path: string) => {
    setSelectedFile(path);
    setSourceResult(null);
    setSourceError(null);
    setSourceLoading(true);
    api.source(path)
      .then((r) => {
        setSourceLoading(false);
        if (r) setSourceResult(r);
        else setSourceError("File not found.");
      })
      .catch(() => {
        setSourceLoading(false);
        setSourceError("Could not load source.");
      });
  }, []);

  const closeViewer = useCallback(() => {
    setSelectedFile(null);
    setSourceResult(null);
    setSourceError(null);
    setSourceLoading(false);
  }, []);

  // Trigger fitView after layout changes (sidebar toggle / viewer open/close).
  // We fire multiple delayed shots because React Flow processes its own
  // ResizeObserver asynchronously — the 400ms shot reliably catches it.
  const viewerVisible = sourceLoading || !!sourceResult || !!sourceError;
  useEffect(() => {
    // Use rAF to wait for the browser to paint the new flex layout, then
    // multiple setTimeouts to catch RF's own resize processing.
    let t1: ReturnType<typeof setTimeout>;
    let t2: ReturnType<typeof setTimeout>;
    let t3: ReturnType<typeof setTimeout>;
    const raf = requestAnimationFrame(() => {
      t1 = setTimeout(() => fitViewRef.current?.(), 50);
      t2 = setTimeout(() => fitViewRef.current?.(), 200);
      t3 = setTimeout(() => fitViewRef.current?.(), 500);
    });
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [sidebarOpen, viewerVisible]);

  // Reset tour when the view changes (drilled into a new level).
  useEffect(() => { setTourActive(false); }, [nav.view]);

  // Files/+Symbols granularity applies only at file level; reset when leaving it.
  const hasFileNodes = (nav.view?.nodes ?? []).some((n) => (n as { level?: string }).level === "file");
  useEffect(() => { if (!hasFileNodes) setShowSymbols(false); }, [hasFileNodes]);

  // Harness engagement (statusline) state.
  useEffect(() => { api.activationState().then((s) => setEngaged(!!s.statusLinePresent)).catch(() => {}); }, []);
  const onActivate = useCallback(() => {
    api.activate(engaged).then((s) => setEngaged(!!s.statusLinePresent)).catch(() => {});
  }, [engaged]);

  // "?" key toggles the shortcuts overlay (only when focus is not in an input).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "?" && !e.metaKey && !e.ctrlKey) {
        setShortcutsOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const openNode = useCallback((id: string) => {
    void api.node(id).then((d) => { if (d) setDetail(d); });
    void api.recommendations(id).then(setRecs).catch(() => setRecs([]));
    void api.nodeLogs(id, 20).then(setLogs).catch(() => setLogs([]));
    void api.nodeMetrics(id).then(setMetrics).catch(() => setMetrics([]));
  }, []);

  // ── Splitter drag logic ──────────────────────────────────────────────────
  const onSplitterPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartWidth.current = rightWidth;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [rightWidth]);

  const onSplitterPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    const delta = dragStartX.current - e.clientX; // dragging left = wider right pane
    const newW = Math.max(RIGHT_PANE_MIN, Math.min(RIGHT_PANE_MAX, dragStartWidth.current + delta));
    setRightWidth(newW);
    // Re-fit after each move (debounced via rAF)
    requestAnimationFrame(() => fitViewRef.current?.());
  }, []);

  const onSplitterPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    // Final re-fit once drag ends
    setTimeout(() => fitViewRef.current?.(), 40);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "row", height: "100vh", background: "var(--bg)", color: "var(--text)" }}>
      <ControlRail
        status={status}
        active={{ live: liveOn, hot: hotOn, procs: procsOpen, ask: askOpen, harness: harnessOpen, context: contextOpen }}
        on={{
          toggleLive: () => setLiveOn((v) => !v),
          replay: onReplay,
          toggleHot: () => setHotOn((v) => !v),
          openProcs: () => setProcsOpen(true),
          openAsk: () => setAskOpen(true),
          openHarness: () => setHarnessOpen(true),
          openContext: () => setContextOpen(true),
        }}
        collapsed={railCollapsed}
        onCollapsedChange={(v) => { setRailCollapsed(v); try { localStorage.setItem("telos.rail.collapsed", v ? "1" : "0"); } catch { /* ignore */ } }}
        api={api}
        onOpenNode={openNode}
        density={density}
        onDensity={(m) => setDensity(m as DensityMode)}
        theme={theme}
        onToggleTheme={toggleTheme}
        explorerOpen={sidebarOpen}
        onToggleExplorer={() => setSidebarOpen((v) => !v)}
        onShortcuts={() => setShortcutsOpen(true)}
        onTour={() => setTourActive(true)}
        tourActive={tourActive}
        onExport={() => exportRef.current?.exportSvg()}
        showSymbols={showSymbols}
        onShowSymbols={setShowSymbols}
        granularityApplicable={hasFileNodes}
        engaged={engaged}
        onActivate={onActivate}
      />
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, height: "100%", position: "relative" }}>

      {/* ── Main area: [Explorer | Map | Right pane] ──────────────────── */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>

        {/* Left sidebar — collapsible file explorer (its own column) */}
        {sidebarOpen && (
          <nav
            aria-label="File explorer"
            style={{
              width: SIDEBAR_WIDTH, minWidth: SIDEBAR_WIDTH, maxWidth: SIDEBAR_WIDTH,
              background: "var(--surface)", borderRight: "1px solid var(--border)",
              display: "flex", flexDirection: "column", overflow: "hidden", flexShrink: 0,
            }}
          >
            <div style={{ height: 36, display: "flex", alignItems: "center", padding: "0 var(--s-3)", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
              <span style={{ fontSize: "var(--t-meta-size)", fontWeight: 600, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "var(--font-ui)" }}>
                Explorer
              </span>
            </div>
            <FileTree paths={filePaths} selectedPath={selectedFile} onSelectFile={openFile} />
          </nav>
        )}

        {/* Map — always gets the remaining flex space.
            layoutKey forces RF to remount (and re-fitView) when the pane
            configuration changes (sidebar or viewer toggled). Splitter drags
            are handled by the useStore(s.width) observer inside FitViewRegistrar. */}
        <div style={{ flex: 1, minWidth: MAP_MIN_WIDTH, position: "relative" }}>
          {/* Floating graph breadcrumbs — top-center over the map (no top bar) */}
          <div style={{ position: "absolute", top: "var(--s-3)", left: "50%", transform: "translateX(-50%)", zIndex: 5, maxWidth: "82%", display: "flex", justifyContent: "center" }}>
            <div style={{ background: "color-mix(in srgb, var(--surface) 90%, transparent)", border: "1px solid var(--border)", borderRadius: "var(--r-md, 8px)", padding: "var(--s-1) var(--s-3)", boxShadow: "var(--shadow-panel)", backdropFilter: "blur(6px)", maxWidth: "100%", overflow: "hidden" }}>
              <Breadcrumbs crumbs={nav.crumbs} onJump={nav.goToCrumb} />
            </div>
          </div>
          <MapView
            nav={nav}
            api={api}
            density={density}
            theme={theme}
            onOpenNode={openNode}
            registerFitView={registerFitView}
            tourActive={tourActive}
            onTourClose={() => setTourActive(false)}
            registerExport={registerExport}
            showSymbols={showSymbols}
            layoutKey={`${sidebarOpen ? "s" : ""}${viewerVisible ? "v" : ""}`}
            trace={trace}
            replayNodeId={playback.activeNodeId}
            hotIntensity={hotOn ? profile.intensity : undefined}
            forge={forge}
          />
        </div>

        {/* Draggable splitter — only when the right pane is visible */}
        {viewerVisible && (
          <div
            role="separator"
            aria-label="Resize code viewer"
            aria-orientation="vertical"
            style={{
              width: 5,
              flexShrink: 0,
              background: "var(--border)",
              cursor: "col-resize",
              zIndex: 15,
              transition: "background 80ms ease",
              position: "relative",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--accent)"; }}
            onMouseLeave={(e) => { if (!isDragging.current) (e.currentTarget as HTMLElement).style.background = "var(--border)"; }}
            onPointerDown={onSplitterPointerDown}
            onPointerMove={onSplitterPointerMove}
            onPointerUp={onSplitterPointerUp}
          />
        )}

        {/* Right pane — CodeViewer as a true flex sibling (not an overlay) */}
        {viewerVisible && (
          <div
            style={{
              flexBasis: rightWidth,
              flexGrow: 0,
              flexShrink: 1, /* yield to the map's min width on tight screens */
              minWidth: RIGHT_PANE_MIN,
              maxWidth: RIGHT_PANE_MAX,
              display: "flex",
              flexDirection: "column",
              borderLeft: "none", /* splitter provides visual separation */
              overflow: "hidden",
            }}
          >
            <CodeViewer
              source={sourceResult}
              loading={sourceLoading}
              error={sourceError}
              theme={theme}
              onClose={closeViewer}
            />
          </div>
        )}
      </div>

      <DetailPanel detail={detail} recommendations={recs} logs={logs} metrics={metrics} onClose={() => { setDetail(null); setRecs([]); setLogs([]); setMetrics([]); }} />
      <AskPanel open={askOpen} api={api} onOpenNode={openNode} onClose={() => setAskOpen(false)} />
      <ProcessPanel open={procsOpen} api={api} onOpenNode={openNode} onClose={() => setProcsOpen(false)} />
      <HarnessPanel open={harnessOpen} api={api} onClose={() => setHarnessOpen(false)} />
      <ContextPanel open={contextOpen} api={api} onClose={() => setContextOpen(false)} />
      <ShortcutsOverlay open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      </div>
    </div>
  );
}

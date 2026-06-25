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
import { SearchBox } from "./components/SearchBox";
import { DetailPanel } from "./components/DetailPanel";
import { ShortcutsOverlay } from "./components/ShortcutsOverlay";
import { FileTree } from "./components/FileTree";
import { CodeViewer } from "./components/CodeViewer";
import { AskPanel } from "./components/AskPanel";
import { ProcessPanel } from "./components/ProcessPanel";
import { HarnessPanel } from "./components/HarnessPanel";

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
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg)", color: "var(--text)", position: "relative" }}>
      {/* ── Top bar — 48px, --surface ──────────────────────────────────── */}
      <header
        style={{
          height: 48,
          minHeight: 48,
          display: "flex",
          alignItems: "center",
          gap: "var(--s-4)",
          padding: "0 var(--s-4)",
          background: "var(--surface)",
          borderBottom: "1px solid var(--border)",
          zIndex: 10,
        }}
      >
        {/* Explorer toggle */}
        <button
          onClick={() => setSidebarOpen((v) => !v)}
          aria-label={sidebarOpen ? "Close file explorer" : "Open file explorer"}
          aria-pressed={sidebarOpen}
          title="Toggle file explorer"
          style={{
            flexShrink: 0,
            background: sidebarOpen ? "var(--accent-soft)" : "none",
            border: `1px solid ${sidebarOpen ? "var(--accent)" : "var(--border)"}`,
            borderRadius: "var(--r-sm)",
            cursor: "pointer",
            color: sidebarOpen ? "var(--accent)" : "var(--text-faint)",
            fontSize: 14,
            lineHeight: 1,
            width: 28,
            height: 28,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            outline: "none",
          }}
          onFocus={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "0 0 0 2px var(--accent)"; }}
          onBlur={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}
        >
          ☰
        </button>

        {/* Wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", flexShrink: 0 }}>
          <span aria-hidden="true" style={{ color: "var(--accent)", fontSize: 16, lineHeight: 1, fontWeight: 700 }}>◇</span>
          <h1
            style={{
              margin: 0,
              fontSize: "var(--t-wordmark-size)",
              lineHeight: "var(--t-wordmark-lh)",
              fontWeight: "var(--t-wordmark-weight)" as React.CSSProperties["fontWeight"],
              fontFamily: "var(--font-ui)",
              color: "var(--text)",
              letterSpacing: "-0.01em",
            }}
          >
            Telos
          </h1>
        </div>

        <div aria-hidden="true" style={{ width: 1, height: 20, background: "var(--border)", flexShrink: 0 }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <Breadcrumbs crumbs={nav.crumbs} onJump={nav.goToCrumb} />
        </div>

        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: "var(--s-3)" }} role="group" aria-label="View controls">
          <div style={{ display: "flex", gap: 0 }} role="group" aria-label="Detail density">
            {(["overview", "learn", "deep"] as DensityMode[]).map((m, i) => (
              <button
                key={m}
                onClick={() => setDensity(m)}
                aria-pressed={density === m}
                title={m === "overview" ? "Label only" : m === "learn" ? "Label + key metrics" : "All metrics + complexity"}
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--t-meta-size)",
                  lineHeight: "var(--t-meta-lh)",
                  padding: "2px var(--s-2)",
                  background: density === m ? "var(--accent-soft)" : "none",
                  border: `1px solid ${density === m ? "var(--accent)" : "var(--border)"}`,
                  borderLeft: i > 0 ? "none" : undefined,
                  borderRadius: i === 0 ? "var(--r-sm) 0 0 var(--r-sm)" : i === 2 ? "0 var(--r-sm) var(--r-sm) 0" : 0,
                  color: density === m ? "var(--accent)" : "var(--text-faint)",
                  cursor: "pointer",
                  outline: "none",
                  textTransform: "capitalize",
                  whiteSpace: "nowrap",
                }}
                onFocus={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "0 0 0 2px var(--accent)"; }}
                onBlur={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}
              >
                {m}
              </button>
            ))}
          </div>

          <button
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            title={theme === "dark" ? "Light theme" : "Dark theme"}
            style={{
              flexShrink: 0,
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-sm)",
              cursor: "pointer",
              color: "var(--text-muted)",
              fontSize: 14,
              lineHeight: 1,
              width: 28,
              height: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              outline: "none",
            }}
            onFocus={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "0 0 0 2px var(--accent)"; }}
            onBlur={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--accent)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; }}
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </div>

        <div aria-hidden="true" style={{ width: 1, height: 20, background: "var(--border)", flexShrink: 0 }} />

        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: "var(--s-2)" }}>
          <button
            onClick={() => setLiveOn((v) => !v)}
            aria-label="Toggle live trace overlay"
            aria-pressed={liveOn}
            title={liveOn ? `Live trace on${trace.state ? ` — ${trace.totalCalls} calls / ${Math.round(trace.state.windowMs / 1000)}s, ${trace.state.unmapped} unmapped` : ""}` : "Animate live OpenTelemetry traffic on the map"}
            style={{
              flexShrink: 0,
              background: liveOn ? "var(--danger-soft, var(--accent-soft))" : "none",
              border: `1px solid ${liveOn ? "var(--danger, var(--accent))" : "var(--border)"}`,
              borderRadius: "var(--r-sm)",
              cursor: "pointer",
              color: liveOn ? "var(--danger, var(--accent))" : "var(--text-muted)",
              fontFamily: "var(--font-ui)",
              fontSize: "var(--t-meta-size)",
              lineHeight: 1,
              height: 28,
              padding: "0 var(--s-3)",
              display: "flex",
              alignItems: "center",
              gap: "var(--s-1)",
              outline: "none",
            }}
            onFocus={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "0 0 0 2px var(--accent)"; }}
            onBlur={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}
          >
            <span aria-hidden="true" style={{ animation: liveOn ? "sentinelPulse 1.6s ease-in-out infinite" : "none" }}>●</span>
            {liveOn && trace.state ? `Live · ${trace.totalCalls}` : "Live"}
          </button>
          <button
            onClick={onReplay}
            aria-label={playback.playing ? "Stop trace replay" : "Replay the most recent trace"}
            aria-pressed={playback.playing}
            title="Replay the most recent request as a path through the map"
            style={{
              flexShrink: 0,
              background: playback.playing ? "var(--accent-soft)" : "none",
              border: `1px solid ${playback.playing ? "var(--accent)" : "var(--border)"}`,
              borderRadius: "var(--r-sm)",
              cursor: "pointer",
              color: playback.playing ? "var(--accent)" : "var(--text-muted)",
              fontFamily: "var(--font-ui)",
              fontSize: "var(--t-meta-size)",
              lineHeight: 1,
              height: 28,
              padding: "0 var(--s-3)",
              display: "flex",
              alignItems: "center",
              gap: "var(--s-1)",
              outline: "none",
            }}
            onFocus={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "0 0 0 2px var(--accent)"; }}
            onBlur={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}
          >
            <span aria-hidden="true">{playback.playing ? "■" : "▷"}</span>
            {playback.playing ? `${playback.step + 1}/${playback.total}` : "Replay"}
          </button>
          <button
            onClick={() => setHotOn((v) => !v)}
            aria-label="Toggle hot-path profile overlay"
            aria-pressed={hotOn}
            title={hotOn ? `Hot-path overlay on${profile.snapshot ? ` — ${profile.totalSamples} samples` : ""}` : "Heat the most-sampled code (continuous profiling)"}
            style={{
              flexShrink: 0,
              background: hotOn ? "rgba(245,158,11,0.18)" : "none",
              border: `1px solid ${hotOn ? "#F59E0B" : "var(--border)"}`,
              borderRadius: "var(--r-sm)",
              cursor: "pointer",
              color: hotOn ? "#F59E0B" : "var(--text-muted)",
              fontFamily: "var(--font-ui)",
              fontSize: "var(--t-meta-size)",
              lineHeight: 1,
              height: 28,
              padding: "0 var(--s-3)",
              display: "flex",
              alignItems: "center",
              gap: "var(--s-1)",
              outline: "none",
            }}
            onFocus={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "0 0 0 2px var(--accent)"; }}
            onBlur={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}
          >
            <span aria-hidden="true">🔥</span>
            {hotOn && profile.snapshot ? `Hot · ${profile.totalSamples}` : "Hot"}
          </button>
          <button
            onClick={() => setProcsOpen(true)}
            aria-label="Show local processes"
            aria-pressed={procsOpen}
            title="Local processes (CPU/memory), mapped to code"
            style={{
              flexShrink: 0,
              background: procsOpen ? "var(--accent-soft)" : "none",
              border: `1px solid ${procsOpen ? "var(--accent)" : "var(--border)"}`,
              borderRadius: "var(--r-sm)",
              cursor: "pointer",
              color: procsOpen ? "var(--accent)" : "var(--text-muted)",
              fontFamily: "var(--font-ui)",
              fontSize: "var(--t-meta-size)",
              lineHeight: 1,
              height: 28,
              padding: "0 var(--s-3)",
              display: "flex",
              alignItems: "center",
              gap: "var(--s-1)",
              outline: "none",
            }}
            onFocus={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "0 0 0 2px var(--accent)"; }}
            onBlur={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}
          >
            <span aria-hidden="true">▤</span> Procs
          </button>
          <button
            onClick={() => setHarnessOpen(true)}
            aria-label="Show harness cockpit"
            aria-pressed={harnessOpen}
            title="Installed harnesses, enabled capabilities, drift"
            style={{
              flexShrink: 0,
              background: harnessOpen ? "var(--accent-soft)" : "none",
              border: `1px solid ${harnessOpen ? "var(--accent)" : "var(--border)"}`,
              borderRadius: "var(--r-sm)",
              cursor: "pointer",
              color: harnessOpen ? "var(--accent)" : "var(--text-muted)",
              fontFamily: "var(--font-ui)",
              fontSize: "var(--t-meta-size)",
              lineHeight: 1,
              height: 28,
              padding: "0 var(--s-3)",
              display: "flex",
              alignItems: "center",
              gap: "var(--s-1)",
              outline: "none",
            }}
            onFocus={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "0 0 0 2px var(--accent)"; }}
            onBlur={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}
          >
            <span aria-hidden="true">⚙</span> Harness
          </button>
          <button
            onClick={() => setAskOpen(true)}
            aria-label="Ask the codebase"
            title="Ask where something happens / take a tour"
            style={{
              flexShrink: 0,
              background: askOpen ? "var(--accent-soft)" : "none",
              border: `1px solid ${askOpen ? "var(--accent)" : "var(--border)"}`,
              borderRadius: "var(--r-sm)",
              cursor: "pointer",
              color: askOpen ? "var(--accent)" : "var(--text-muted)",
              fontFamily: "var(--font-ui)",
              fontSize: "var(--t-meta-size)",
              lineHeight: 1,
              height: 28,
              padding: "0 var(--s-3)",
              display: "flex",
              alignItems: "center",
              gap: "var(--s-1)",
              outline: "none",
            }}
            onFocus={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "0 0 0 2px var(--accent)"; }}
            onBlur={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--accent)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)"; }}
            onMouseLeave={(e) => { if (!askOpen) { (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; } }}
          >
            <span aria-hidden="true">✦</span> Ask
          </button>
          <div style={{ width: 224 }}>
            <SearchBox api={api} onSelect={(node: TelosNodeDTO) => openNode(node.id)} />
          </div>
          <button
            onClick={() => setShortcutsOpen(true)}
            aria-label="Keyboard shortcuts (?)"
            title="Keyboard shortcuts"
            style={{
              flexShrink: 0,
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-sm)",
              cursor: "pointer",
              color: "var(--text-faint)",
              fontFamily: "var(--font-mono)",
              fontSize: "var(--t-meta-size)",
              lineHeight: 1,
              width: 24,
              height: 24,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              outline: "none",
            }}
            onFocus={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "0 0 0 2px var(--accent)"; }}
            onBlur={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--text-muted)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-faint)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; }}
          >
            ?
          </button>
        </div>
      </header>

      {/* ── Main area: [Explorer | Map | Right pane] ──────────────────── */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>

        {/* Left sidebar — collapsible file explorer */}
        {sidebarOpen && (
          <nav
            aria-label="File explorer"
            style={{
              width: SIDEBAR_WIDTH,
              minWidth: SIDEBAR_WIDTH,
              maxWidth: SIDEBAR_WIDTH,
              background: "var(--surface)",
              borderRight: "1px solid var(--border)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            {/* Explorer header */}
            <div
              style={{
                height: 36,
                display: "flex",
                alignItems: "center",
                padding: "0 var(--s-3)",
                borderBottom: "1px solid var(--border)",
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  fontSize: "var(--t-meta-size)",
                  fontWeight: 600,
                  color: "var(--text-faint)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  fontFamily: "var(--font-ui)",
                }}
              >
                Explorer
              </span>
            </div>

            <FileTree
              paths={filePaths}
              selectedPath={selectedFile}
              onSelectFile={openFile}
            />
          </nav>
        )}

        {/* Map — always gets the remaining flex space.
            layoutKey forces RF to remount (and re-fitView) when the pane
            configuration changes (sidebar or viewer toggled). Splitter drags
            are handled by the useStore(s.width) observer inside FitViewRegistrar. */}
        <div style={{ flex: 1, minWidth: MAP_MIN_WIDTH, position: "relative" }}>
          <MapView
            nav={nav}
            api={api}
            density={density}
            theme={theme}
            onOpenNode={openNode}
            registerFitView={registerFitView}
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
      <ShortcutsOverlay open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}

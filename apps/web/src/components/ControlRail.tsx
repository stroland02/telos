/**
 * ControlRail — Telos's single control surface: a persistent left sidebar that
 * holds EVERYTHING (search, view controls, every feature, status) so there is no
 * duplicated top bar to confuse the user. Pure presentational — all state + data
 * come in via props. Token-styled, no hard-coded hex.
 */

import { motion, useReducedMotion } from "framer-motion";
import { TelosApi } from "../api/client";
import { TelosStatus, TelosNodeDTO } from "../api/types";
import { SearchBox } from "./SearchBox";
import { SegmentedControl, IconButton, spring } from "./ui";

export interface RailActive {
  live: boolean; hot: boolean; procs: boolean; ask: boolean; harness: boolean; context: boolean;
}
export interface RailHandlers {
  toggleLive: () => void; replay: () => void; toggleHot: () => void; openProcs: () => void;
  openAsk: () => void; openHarness: () => void; openContext: () => void;
}

export function ControlRail({
  status, active, on, collapsed, onCollapsedChange,
  api, onOpenNode, density, onDensity, theme, onToggleTheme,
  explorerOpen, onToggleExplorer, onShortcuts,
  onTour, tourActive, onExport,
  showSymbols, onShowSymbols, granularityApplicable,
  engaged, onActivate, onResolve, resolveCount,
}: {
  status: TelosStatus;
  active: RailActive;
  on: RailHandlers;
  collapsed: boolean;
  onCollapsedChange: (v: boolean) => void;
  api: TelosApi;
  onOpenNode: (id: string) => void;
  density: string;
  onDensity: (m: string) => void;
  theme?: string;
  onToggleTheme: () => void;
  explorerOpen: boolean;
  onToggleExplorer: () => void;
  onShortcuts: () => void;
  onTour: () => void;
  tourActive: boolean;
  onExport: () => void;
  showSymbols: boolean;
  onShowSymbols: (v: boolean) => void;
  granularityApplicable: boolean;
  engaged: boolean;
  onActivate: () => void;
  onResolve: () => void;
  resolveCount: number;
}) {
  const badge = (v: string | number | null | undefined) => (v === null || v === undefined ? "—" : String(v));
  const g = status.graph;
  const langs = g && Array.isArray(g.languages) ? g.languages.join(", ") : "—";

  return (
    <nav
      aria-label="Telos control rail"
      style={{
        width: collapsed ? 48 : 220, flexShrink: 0, height: "100%",
        background: "var(--surface)", borderRight: "1px solid var(--border)",
        display: "flex", flexDirection: "column", overflow: "hidden",
        fontFamily: "var(--font-ui)", fontSize: "var(--t-meta-size)",
      }}
    >
      {/* Brand + collapse */}
      <div style={{ display: "flex", alignItems: "center", padding: "var(--s-2)", borderBottom: "1px solid var(--border)", gap: "var(--s-2)" }}>
        <span aria-hidden="true" style={{ color: "var(--accent)", fontSize: 16, fontWeight: 700, flexShrink: 0 }}>◇</span>
        {!collapsed && <h1 style={{ flex: 1, margin: 0, color: "var(--text)", fontSize: "var(--t-wordmark-size, 15px)", fontWeight: 700, letterSpacing: "-0.01em" }}>Telos</h1>}
        <IconButton aria-label={collapsed ? "Expand control rail" : "Collapse control rail"} onClick={() => onCollapsedChange(!collapsed)}>
          {collapsed ? "»" : "«"}
        </IconButton>
      </div>

      {/* Search */}
      {!collapsed && (
        <div style={{ padding: "var(--s-2)", borderBottom: "1px solid var(--border)" }}>
          <SearchBox api={api} onSelect={(node: TelosNodeDTO) => onOpenNode(node.id)} />
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto", padding: "var(--s-1)" }}>
        {/* View — the core surfaces, always on top */}
        {!collapsed && <Group label="View" />}
        <Item icon="▦" label="Map" active sub="graph" collapsed={collapsed} onClick={() => {}} />
        <Item icon="☰" label="Explorer" active={explorerOpen} sub={explorerOpen ? "shown" : "hidden"} collapsed={collapsed} onClick={onToggleExplorer} />

        {/* Agent — Telos's headline capability */}
        {!collapsed && <Group label="Agent" />}
        <Item icon="✦" label="Ask" active={active.ask} sub="Q&A / tour" collapsed={collapsed} onClick={on.openAsk} />
        <Item icon="⚙" label="Harness" active={active.harness} sub={status.harness ? `${status.harness.caps} caps · ${status.harness.drift}` : "—"} collapsed={collapsed} onClick={on.openHarness} />
        <Item icon="❖" label="Context" active={active.context} sub="graph memory" collapsed={collapsed} onClick={on.openContext} />
        <Item icon="⚡" label="Activate" active={engaged} sub={engaged ? "engaged" : "off"} collapsed={collapsed} onClick={onActivate} />

        {/* Build */}
        {!collapsed && <Group label="Build" />}
        <Item icon="⚒" label="Forge" sub={status.forge ? `turn ${status.forge.turn} · $${status.forge.costUsd.toFixed(2)}` : "idle"} collapsed={collapsed} onClick={() => {}} />
        <Item icon="⚠" label="Resolve" sub={resolveCount > 0 ? `${resolveCount} findings` : "scan"} collapsed={collapsed} onClick={onResolve} />

        {/* Live signals — real but evolving; sits below the solid features */}
        {!collapsed && <Group label="Live signals" />}
        <Item icon="●" label="Live" active={active.live} sub={`${badge(status.live?.calls)} calls`} collapsed={collapsed} onClick={on.toggleLive} />
        <Item icon="▷" label="Replay" sub="newest" collapsed={collapsed} onClick={on.replay} />
        <Item icon="🔥" label="Hot" active={active.hot} sub="hot path" collapsed={collapsed} onClick={on.toggleHot} />
        <Item icon="▤" label="Procs" active={active.procs} sub={`${badge(status.procs)}`} collapsed={collapsed} onClick={on.openProcs} />

        {/* Display — view-shaping controls, kept at the bottom */}
        {!collapsed && <Group label="Display" />}
        {!collapsed && (
          <div style={{ padding: "var(--s-1) var(--s-2)" }}>
            <SegmentedControl
              ariaLabel="Detail density"
              idBase="density"
              value={density}
              onChange={onDensity}
              options={[
                { value: "overview", label: "overview", title: "Label only" },
                { value: "learn", label: "learn", title: "Label + key metrics" },
                { value: "deep", label: "deep", title: "All metrics" },
              ]}
            />
          </div>
        )}

        {!collapsed && (
          <div title={granularityApplicable ? "Files vs files + symbols" : "Applies at file level — drill into a file"} style={{ padding: "0 var(--s-2) var(--s-1)", opacity: granularityApplicable ? 1 : 0.45 }}>
            <SegmentedControl
              ariaLabel="Granularity"
              idBase="granularity"
              value={showSymbols ? "symbols" : "files"}
              onChange={(v) => onShowSymbols(v === "symbols")}
              options={[
                { value: "files", label: "Files" },
                { value: "symbols", label: "+Symbols" },
              ]}
            />
          </div>
        )}

        <Item icon="▶" label="Tour" active={tourActive} sub="walk nodes" collapsed={collapsed} onClick={onTour} />
        <Item icon="⤓" label="Export" sub="image" collapsed={collapsed} onClick={onExport} />
      </div>

      {/* Footer: stats + theme + shortcuts */}
      <div style={{ borderTop: "1px solid var(--border)", padding: "var(--s-2)", display: "flex", flexDirection: "column", gap: "var(--s-2)" }}>
        {!collapsed && (
          <div style={{ color: "var(--text-faint)", lineHeight: 1.5 }}>
            <div>{g ? `${g.nodes} nodes · ${g.edges} edges` : "— nodes"}</div>
            <div>{g ? `${g.enriched}/${g.nodes} summaries` : "—"}</div>
            <div title={langs} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{langs}</div>
          </div>
        )}
        <div style={{ display: "flex", gap: "var(--s-2)", justifyContent: collapsed ? "center" : "flex-start" }}>
          <IconButton aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} title="Toggle theme" onClick={onToggleTheme}>
            {theme === "dark" ? "☀" : "☾"}
          </IconButton>
          <IconButton aria-label="Keyboard shortcuts (?)" title="Keyboard shortcuts" onClick={onShortcuts}>?</IconButton>
        </div>
      </div>
    </nav>
  );
}

function Group({ label }: { label: string }) {
  return <div style={{ padding: "var(--s-2) var(--s-2) var(--s-1)", color: "var(--text-faint)", textTransform: "uppercase", fontSize: 10, letterSpacing: 0.5 }}>{label}</div>;
}

function Item({
  icon, label, sub, active, collapsed, onClick,
}: { icon: string; label: string; sub?: string; active?: boolean; collapsed: boolean; onClick: () => void }) {
  const reduce = useReducedMotion();
  return (
    <motion.button
      onClick={onClick}
      aria-pressed={active ?? undefined}
      title={collapsed ? `${label}${sub ? ` — ${sub}` : ""}` : undefined}
      whileHover={reduce || active ? undefined : { backgroundColor: "var(--hover)" }}
      whileTap={reduce ? undefined : { scale: 0.98 }}
      transition={spring}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: "var(--s-2)",
        padding: "var(--s-1) var(--s-2)", borderRadius: "var(--r-sm)", cursor: "pointer",
        background: active ? "var(--accent-soft)" : "none",
        border: `1px solid ${active ? "var(--accent)" : "transparent"}`,
        color: active ? "var(--accent)" : "var(--text-muted)",
        fontFamily: "inherit", fontSize: "inherit", textAlign: "left", outline: "none",
        justifyContent: collapsed ? "center" : "flex-start",
      }}
      onFocus={(e) => { e.currentTarget.style.boxShadow = "var(--focus-ring)"; }}
      onBlur={(e) => { e.currentTarget.style.boxShadow = "none"; }}
    >
      <span aria-hidden="true" style={{ width: 16, textAlign: "center", flexShrink: 0 }}>{icon}</span>
      {!collapsed && <span style={{ flex: 1, color: "var(--text)" }}>{label}</span>}
      {!collapsed && sub && <span style={{ color: "var(--text-faint)", fontSize: 11 }}>{sub}</span>}
    </motion.button>
  );
}

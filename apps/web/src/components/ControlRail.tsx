/**
 * ControlRail — Telos's "mission control": a persistent left sidebar that shows
 * the live status of, and launches, every feature. Pure presentational — all
 * state + data come in via props (status from useTelosStatus, toggles from App).
 * Token-styled, no hard-coded hex.
 */

import { TelosStatus } from "../api/types";

export interface RailActive {
  live: boolean; hot: boolean; procs: boolean; ask: boolean; harness: boolean; context: boolean;
}
export interface RailHandlers {
  toggleLive: () => void; replay: () => void; toggleHot: () => void; openProcs: () => void;
  openAsk: () => void; openHarness: () => void; openContext: () => void;
}

export function ControlRail({
  status, active, on, collapsed, onCollapsedChange,
}: {
  status: TelosStatus;
  active: RailActive;
  on: RailHandlers;
  collapsed: boolean;
  onCollapsedChange: (v: boolean) => void;
}) {
  const badge = (v: string | number | null | undefined) =>
    v === null || v === undefined ? "—" : String(v);

  const g = status.graph;
  const langs = g ? g.languages.join(", ") : "—";

  return (
    <nav
      aria-label="Telos control rail"
      style={{
        width: collapsed ? 48 : 208, flexShrink: 0, height: "100%",
        background: "var(--surface)", borderRight: "1px solid var(--border)",
        display: "flex", flexDirection: "column", overflow: "hidden",
        fontFamily: "var(--font-ui)", fontSize: "var(--t-meta-size)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", padding: "var(--s-2)", borderBottom: "1px solid var(--border)", gap: "var(--s-2)" }}>
        {!collapsed && <span style={{ flex: 1, color: "var(--text)", fontWeight: 600 }}>Telos</span>}
        <button
          aria-label={collapsed ? "Expand control rail" : "Collapse control rail"}
          onClick={() => onCollapsedChange(!collapsed)}
          style={iconBtn}
        >
          {collapsed ? "»" : "«"}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "var(--s-1)" }}>
        {!collapsed && <Group label="View" />}
        <Item icon="▦" label="Map" active sub="graph" collapsed={collapsed} onClick={() => {}} />

        {!collapsed && <Group label="Live signals" />}
        <Item icon="●" label="Live" active={active.live} sub={`${badge(status.live?.calls)} calls`} collapsed={collapsed} onClick={on.toggleLive} />
        <Item icon="▷" label="Replay" sub="newest" collapsed={collapsed} onClick={on.replay} />
        <Item icon="🔥" label="Hot" active={active.hot} sub="hot path" collapsed={collapsed} onClick={on.toggleHot} />
        <Item icon="▤" label="Procs" active={active.procs} sub={`${badge(status.procs)}`} collapsed={collapsed} onClick={on.openProcs} />

        {!collapsed && <Group label="Agent" />}
        <Item icon="✦" label="Ask" active={active.ask} sub="Q&A / tour" collapsed={collapsed} onClick={on.openAsk} />
        <Item icon="⚙" label="Harness" active={active.harness} sub={status.harness ? `${status.harness.caps} caps · ${status.harness.drift}` : "—"} collapsed={collapsed} onClick={on.openHarness} />
        <Item icon="❖" label="Context" active={active.context} sub="graph memory" collapsed={collapsed} onClick={on.openContext} />

        {!collapsed && <Group label="Build" />}
        <Item icon="⚒" label="Forge" sub={status.forge ? `turn ${status.forge.turn} · $${status.forge.costUsd.toFixed(2)}` : "idle"} collapsed={collapsed} onClick={() => {}} />
      </div>

      {!collapsed && (
        <div style={{ padding: "var(--s-2)", borderTop: "1px solid var(--border)", color: "var(--text-faint)", lineHeight: 1.5 }}>
          <div>{g ? `${g.nodes} nodes · ${g.edges} edges` : "— nodes"}</div>
          <div title={langs}>{g ? `${g.enriched}/${g.nodes} summaries` : "—"}</div>
          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{langs}</div>
        </div>
      )}
    </nav>
  );
}

function Group({ label }: { label: string }) {
  return <div style={{ padding: "var(--s-2) var(--s-2) var(--s-1)", color: "var(--text-faint)", textTransform: "uppercase", fontSize: 10, letterSpacing: 0.5 }}>{label}</div>;
}

function Item({
  icon, label, sub, active, collapsed, onClick,
}: { icon: string; label: string; sub?: string; active?: boolean; collapsed: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active ?? undefined}
      title={collapsed ? `${label}${sub ? ` — ${sub}` : ""}` : undefined}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: "var(--s-2)",
        padding: "var(--s-1) var(--s-2)", borderRadius: "var(--r-sm)", cursor: "pointer",
        background: active ? "var(--accent-soft)" : "none",
        border: `1px solid ${active ? "var(--accent)" : "transparent"}`,
        color: active ? "var(--accent)" : "var(--text-muted)",
        fontFamily: "inherit", fontSize: "inherit", textAlign: "left", outline: "none",
        justifyContent: collapsed ? "center" : "flex-start",
      }}
    >
      <span aria-hidden="true" style={{ width: 16, textAlign: "center", flexShrink: 0 }}>{icon}</span>
      {!collapsed && <span style={{ flex: 1, color: "var(--text)" }}>{label}</span>}
      {!collapsed && sub && <span style={{ color: "var(--text-faint)", fontSize: 11 }}>{sub}</span>}
    </button>
  );
}

const iconBtn: React.CSSProperties = {
  flexShrink: 0, cursor: "pointer", borderRadius: "var(--r-sm)", height: 24, width: 24,
  background: "none", border: "1px solid var(--border)", color: "var(--text-muted)", outline: "none",
};

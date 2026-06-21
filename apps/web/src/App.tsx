import { useState, useCallback, useEffect } from "react";
import { createApi } from "./api/client";
import { NodeDetail, TelosNodeDTO } from "./api/types";
import { useNavigation } from "./graph/useNavigation";
import { MapView } from "./components/MapView";
import { Breadcrumbs } from "./components/Breadcrumbs";
import { SearchBox } from "./components/SearchBox";
import { DetailPanel } from "./components/DetailPanel";
import { ShortcutsOverlay } from "./components/ShortcutsOverlay";

const api = createApi();

export function App() {
  const nav = useNavigation(api);
  const [detail, setDetail] = useState<NodeDetail | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

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
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg)", color: "var(--text)", position: "relative" }}>
      {/* Top bar — 48px, --surface */}
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
        {/* Wordmark */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--s-2)",
            flexShrink: 0,
          }}
        >
          {/* ◇ sentinel diamond glyph */}
          <span
            aria-hidden="true"
            style={{
              color: "var(--accent)",
              fontSize: 16,
              lineHeight: 1,
              fontWeight: 700,
            }}
          >
            ◇
          </span>
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

        {/* Separator */}
        <div
          aria-hidden="true"
          style={{ width: 1, height: 20, background: "var(--border)", flexShrink: 0 }}
        />

        {/* Breadcrumb trail — grows */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Breadcrumbs crumbs={nav.crumbs} onJump={nav.goToCrumb} />
        </div>

        {/* Search box — fixed width, right side */}
        <div style={{ flexShrink: 0, width: 240 }}>
          <SearchBox api={api} onSelect={(node: TelosNodeDTO) => openNode(node.id)} />
        </div>

        {/* "?" shortcut hint button */}
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
            transition: "color 80ms ease, border-color 80ms ease",
          }}
          onFocus={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "0 0 0 2px var(--accent)"; }}
          onBlur={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
            (e.currentTarget as HTMLElement).style.borderColor = "var(--text-muted)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color = "var(--text-faint)";
            (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
          }}
        >
          ?
        </button>
      </header>

      {/* Canvas fills remaining height */}
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        <MapView nav={nav} api={api} onOpenNode={openNode} />
      </div>

      <DetailPanel detail={detail} onClose={() => setDetail(null)} />
      <ShortcutsOverlay open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}

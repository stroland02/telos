import { useState, useCallback } from "react";
import { createApi } from "./api/client";
import { NodeDetail, TelosNodeDTO } from "./api/types";
import { useNavigation } from "./graph/useNavigation";
import { MapView } from "./components/MapView";
import { Breadcrumbs } from "./components/Breadcrumbs";
import { SearchBox } from "./components/SearchBox";
import { DetailPanel } from "./components/DetailPanel";

const api = createApi();

export function App() {
  const nav = useNavigation(api);
  const [detail, setDetail] = useState<NodeDetail | null>(null);

  const openNode = useCallback((id: string) => {
    void api.node(id).then((d) => { if (d) setDetail(d); });
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg)", color: "var(--text)" }}>
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
      </header>

      {/* Canvas fills remaining height */}
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        <MapView nav={nav} onOpenNode={openNode} />
      </div>

      <DetailPanel detail={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

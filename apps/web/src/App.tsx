import { createApi } from "./api/client";
import { MapView } from "./components/MapView";
import { Breadcrumbs } from "./components/Breadcrumbs";
import { SearchBox } from "./components/SearchBox";
import { useNavigation } from "./graph/useNavigation";

const api = createApi();

function AppShell() {
  const nav = useNavigation(api);

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
          <SearchBox api={api} onSelect={(node) => {
            // Open the node detail via drillInto or direct open — for leaves we
            // navigate as a drill; the MapView's own panel will open from node click.
            // Here we just drill into the node's cluster so the map updates.
            nav.drillInto({ id: node.id, label: node.name, level: "file" });
          }} />
        </div>
      </header>

      {/* Canvas fills remaining height */}
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        <MapView api={api} />
      </div>
    </div>
  );
}

export function App() {
  return <AppShell />;
}

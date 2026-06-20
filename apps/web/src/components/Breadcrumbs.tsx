import { Crumb } from "../graph/useNavigation";

export function Breadcrumbs({ crumbs, onJump }: { crumbs: Crumb[]; onJump: (i: number) => void }) {
  return (
    <nav aria-label="breadcrumb" style={{ display: "flex", alignItems: "center", gap: "var(--s-1)", flexWrap: "wrap" }}>
      {crumbs.map((c, i) => {
        const isActive = i === crumbs.length - 1;
        return (
          <span key={`${c.id ?? "root"}-${i}`} style={{ display: "flex", alignItems: "center", gap: "var(--s-1)" }}>
            {i > 0 && (
              <span
                aria-hidden="true"
                style={{
                  color: "var(--text-faint)",
                  fontSize: "var(--t-meta-size)",
                  lineHeight: "var(--t-meta-lh)",
                  userSelect: "none",
                }}
              >
                /
              </span>
            )}
            <button
              onClick={() => onJump(i)}
              aria-current={isActive ? "page" : undefined}
              style={{
                border: "none",
                background: "none",
                padding: "2px var(--s-1)",
                borderRadius: "var(--r-sm)",
                cursor: isActive ? "default" : "pointer",
                fontFamily: "var(--font-ui)",
                fontSize: "var(--t-label-size)",
                lineHeight: "var(--t-label-lh)",
                fontWeight: "var(--t-label-weight)" as React.CSSProperties["fontWeight"],
                color: isActive ? "var(--accent)" : "var(--text-muted)",
                transition: "color 90ms ease, background 90ms ease",
                outline: "none",
              }}
              onFocus={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "0 0 0 2px var(--accent)"; }}
              onBlur={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}
            >
              {c.label}
            </button>
          </span>
        );
      })}
    </nav>
  );
}

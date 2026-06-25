import { useEffect, useRef, useState } from "react";
import { TelosApi } from "../api/client";
import { TelosNodeDTO } from "../api/types";

export function SearchBox({ api, onSelect }: { api: TelosApi; onSelect: (node: TelosNodeDTO) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<TelosNodeDTO[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const inputRef = useRef<HTMLInputElement>(null);

  // ⌘K / Ctrl+K — focus the search input from anywhere in the app.
  // Best practice (devtrium.com): global keydown on window, preventDefault to
  // suppress browser address-bar shortcut, skip when already in an editable
  // element to avoid hijacking normal text entry.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        // Don't steal the shortcut when typing in another input/textarea
        const tag = (e.target as HTMLElement).tagName;
        if (tag === "TEXTAREA" || (tag === "INPUT" && e.target !== inputRef.current)) return;
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) { setResults([]); return; }
    timer.current = setTimeout(() => { void api.search(q.trim()).then(setResults); }, 200);
    return () => clearTimeout(timer.current);
  }, [q, api]);

  return (
    <div style={{ position: "relative", minWidth: 0, width: "100%" }}>
      <input
        ref={inputRef}
        id="telos-search"
        name="search"
        type="text"
        autoComplete="off"
        placeholder="Search… ⌘K"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search symbols"
        style={{
          width: "100%",
          padding: "6px var(--s-3)",
          borderRadius: "var(--r-sm)",
          border: "1px solid var(--border)",
          background: "var(--surface)",
          color: "var(--text)",
          fontFamily: "var(--font-ui)",
          fontSize: "var(--t-body-size)",
          lineHeight: "var(--t-body-lh)",
          outline: "none",
          caretColor: "var(--accent)",
          transition: "box-shadow 90ms ease",
        }}
        onFocus={(e) => { (e.currentTarget as HTMLInputElement).style.boxShadow = "0 0 0 2px var(--accent)"; }}
        onBlur={(e) => {
          (e.currentTarget as HTMLInputElement).style.boxShadow = "none";
          setTimeout(() => setResults([]), 150);
        }}
      />
      {results.length > 0 && (
        <ul
          role="listbox"
          aria-label="Search results"
          style={{
            position: "absolute",
            top: "calc(100% + var(--s-1))",
            left: 0,
            right: 0,
            listStyle: "none",
            margin: 0,
            padding: "var(--s-1) 0",
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-sm)",
            maxHeight: 200,
            overflowY: "auto",
            zIndex: 100,
            boxShadow: "-8px 0 24px rgba(0,0,0,.35)",
          }}
        >
          {results.map((r) => (
            <li key={r.id} role="option" aria-selected={false}>
              <button
                onClick={() => { onSelect(r); setQ(""); setResults([]); }}
                style={{
                  width: "100%",
                  textAlign: "left",
                  border: "none",
                  background: "none",
                  padding: "var(--s-1) var(--s-3)",
                  cursor: "pointer",
                  color: "var(--text)",
                  fontFamily: "var(--font-ui)",
                  fontSize: "var(--t-label-size)",
                  lineHeight: "var(--t-label-lh)",
                  display: "flex",
                  gap: "var(--s-2)",
                  alignItems: "baseline",
                  outline: "none",
                  transition: "background 90ms ease",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--surface)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "none"; }}
                onFocus={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "0 0 0 2px var(--accent) inset"; }}
                onBlur={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}
              >
                <strong style={{ fontWeight: "var(--t-label-weight)" as React.CSSProperties["fontWeight"] }}>{r.name}</strong>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "var(--t-meta-size)",
                    lineHeight: "var(--t-meta-lh)",
                    color: "var(--text-muted)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {r.path}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

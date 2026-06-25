import { useEffect, useRef, useState, useCallback } from "react";
import type { SourceResult } from "../api/types";

// ── Shiki lazy loader ─────────────────────────────────────────────────────────
// Lazy-load shiki on first use to keep initial bundle weight down.

type HighlightFn = (code: string, lang: string, theme: string) => Promise<string>;

let highlightFn: HighlightFn | null = null;

async function getHighlight(): Promise<HighlightFn> {
  if (highlightFn) return highlightFn;
  const shiki = await import("shiki");
  const highlighter = await shiki.createHighlighter({
    themes: ["github-dark", "github-light"],
    langs: [
      "typescript", "javascript", "tsx", "jsx",
      "python", "rust", "go", "java", "kotlin",
      "css", "html", "json", "yaml", "toml",
      "bash", "sh", "sql", "markdown",
    ],
  });
  highlightFn = async (code: string, lang: string, theme: string) => {
    const safeTheme = theme === "light" ? "github-light" : "github-dark";
    // Fall back to 'text' if the language isn't bundled
    const safeLang = highlighter.getLoadedLanguages().includes(lang as never) ? lang : "text";
    return highlighter.codeToHtml(code, { lang: safeLang, theme: safeTheme });
  };
  return highlightFn;
}

// Derive language from file extension
function langFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
    py: "python", rs: "rust", go: "go", java: "java", kt: "kotlin",
    css: "css", html: "html", json: "json", yaml: "yaml", yml: "yaml",
    toml: "toml", sh: "bash", bash: "bash", sql: "sql", md: "markdown",
  };
  return map[ext] ?? "text";
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface CodeViewerProps {
  source: SourceResult | null;
  loading: boolean;
  error: string | null;
  theme: string;
  onClose: () => void;
}

export function CodeViewer({ source, loading, error, theme, onClose }: CodeViewerProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [hlLoading, setHlLoading] = useState(false);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // Focus the close button when viewer opens
  useEffect(() => {
    if (source || loading) closeBtnRef.current?.focus();
  }, [source?.path, loading]);

  // Esc to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Highlight whenever source or theme changes
  useEffect(() => {
    if (!source) { setHtml(null); return; }
    let cancelled = false;
    setHlLoading(true);
    setHtml(null);
    getHighlight()
      .then((fn) => fn(source.content, langFromPath(source.path), theme))
      .then((h) => { if (!cancelled) { setHtml(h); setHlLoading(false); } })
      .catch(() => { if (!cancelled) setHlLoading(false); });
    return () => { cancelled = true; };
  }, [source?.path, source?.content, theme]);

  const isVisible = loading || !!source || !!error;
  if (!isVisible) return null;

  const basename = source?.path.split("/").pop() ?? "";

  return (
    <aside
      role="complementary"
      aria-label="Source viewer"
      style={{
        flex: 1,
        minHeight: 0,
        background: "var(--surface)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        animation: "codeViewerIn 140ms ease-out",
      }}
    >
      <style>{`
        @keyframes codeViewerIn {
          from { opacity: 0; transform: translateX(16px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        /* Shiki output resets — honour token colours, reset margins */
        .telos-code pre {
          margin: 0;
          padding: var(--s-4);
          background: transparent !important;
          font-family: var(--font-mono);
          font-size: 13px;
          line-height: 1.6;
          tab-size: 2;
          overflow-x: auto;
        }
        .telos-code code { background: transparent !important; }
      `}</style>

      {/* Header */}
      <div
        style={{
          height: 40,
          minHeight: 40,
          display: "flex",
          alignItems: "center",
          gap: "var(--s-2)",
          padding: "0 var(--s-4)",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          flexShrink: 0,
        }}
      >
        <span aria-hidden="true" style={{ color: "var(--text-faint)", fontSize: 12 }}>📄</span>
        <span
          title={source?.path}
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: "var(--font-mono)",
            fontSize: "var(--t-label-size)",
            color: "var(--text)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {source?.path ?? "Loading…"}
        </span>

        {source && (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--t-meta-size)",
              color: "var(--text-faint)",
              flexShrink: 0,
            }}
          >
            {source.lines} lines
          </span>
        )}

        <button
          ref={closeBtnRef}
          onClick={onClose}
          aria-label="Close source viewer"
          style={{
            flexShrink: 0,
            border: "none",
            background: "none",
            cursor: "pointer",
            color: "var(--text-muted)",
            fontSize: 18,
            lineHeight: 1,
            padding: "2px var(--s-1)",
            borderRadius: "var(--r-sm)",
            outline: "none",
          }}
          onFocus={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "0 0 0 2px var(--accent)"; }}
          onBlur={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
        >
          ×
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", background: "var(--surface-2)" }}>
        {(loading || hlLoading) && (
          <div
            style={{
              padding: "var(--s-4)",
              fontFamily: "var(--font-mono)",
              fontSize: "var(--t-meta-size)",
              color: "var(--text-faint)",
            }}
          >
            Loading…
          </div>
        )}

        {error && !loading && (
          <div
            role="alert"
            style={{
              padding: "var(--s-4)",
              fontFamily: "var(--font-ui)",
              fontSize: "var(--t-body-size)",
              color: "var(--danger)",
            }}
          >
            {error}
          </div>
        )}

        {html && !hlLoading && (
          <div
            className="telos-code"
            // Shiki-rendered, trusted highlight HTML — not user input
            dangerouslySetInnerHTML={{ __html: html }}
            aria-label={`Source code of ${basename}`}
          />
        )}

        {/* Fallback plain text while shiki loads */}
        {source && !html && !hlLoading && !loading && (
          <pre
            style={{
              margin: 0,
              padding: "var(--s-4)",
              fontFamily: "var(--font-mono)",
              fontSize: 13,
              lineHeight: 1.6,
              color: "var(--text)",
              whiteSpace: "pre",
              overflowX: "auto",
            }}
          >
            {source.content}
          </pre>
        )}
      </div>
    </aside>
  );
}

/**
 * ContextPanel — surfaces the graph-as-memory brief (the same token-budgeted
 * architecture overview that `telos context` and the MCP `telos_context` tool
 * return) inside the web UI. Read-only; opened from the Control Rail.
 *
 * Modeled on ProcessPanel: role="dialog" aria-modal, Esc + backdrop close, focus
 * to the refresh button on open. Token-styled, no hard-coded hex.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { TelosApi } from "../api/client";

export function ContextPanel({
  open, api, onClose,
}: { open: boolean; api: TelosApi; onClose: () => void }) {
  const refreshRef = useRef<HTMLButtonElement>(null);
  const [brief, setBrief] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    api.contextPack()
      .then(setBrief)
      .catch(() => setBrief(""))
      .finally(() => setLoading(false));
  }, [api]);

  useEffect(() => {
    if (!open) return;
    refresh();
    refreshRef.current?.focus();
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose, refresh]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Architecture context"
      onClick={onClose}
      style={{
        position: "absolute", inset: 0, zIndex: 40,
        background: "color-mix(in srgb, var(--bg) 70%, transparent)",
        display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "10vh",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 680, maxWidth: "92vw", maxHeight: "78vh", display: "flex", flexDirection: "column",
          background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-md, 8px)",
          boxShadow: "var(--shadow-panel)", overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", padding: "var(--s-3)", borderBottom: "1px solid var(--border)" }}>
          <span style={{ flex: 1, fontFamily: "var(--font-ui)", fontSize: "var(--t-body-size, 14px)", color: "var(--text)" }}>
            Context <span style={{ color: "var(--text-faint)" }}>(graph-as-memory brief)</span>
          </span>
          <button ref={refreshRef} onClick={refresh} style={btn(true)}>Refresh</button>
        </div>

        <div style={{ overflowY: "auto", padding: "var(--s-3)" }}>
          {loading && <Empty text="Loading…" />}
          {!loading && !brief && <Empty text="No context available. Is the server running on a scanned repo?" />}
          {!loading && brief && (
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "var(--font-mono)", fontSize: "var(--t-meta-size)", color: "var(--text)", lineHeight: 1.5 }}>
              {brief}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

function btn(primary: boolean): React.CSSProperties {
  return {
    flexShrink: 0, cursor: "pointer", borderRadius: "var(--r-sm)", height: 28,
    padding: "0 var(--s-3)", fontFamily: "var(--font-ui)", fontSize: "var(--t-meta-size)",
    background: primary ? "var(--accent-soft)" : "none",
    border: `1px solid ${primary ? "var(--accent)" : "var(--border)"}`,
    color: primary ? "var(--accent)" : "var(--text-muted)", outline: "none",
  };
}
function Empty({ text }: { text: string }) {
  return <div style={{ padding: "var(--s-3)", fontSize: "var(--t-meta-size)", color: "var(--text-faint)", fontStyle: "italic" }}>{text}</div>;
}

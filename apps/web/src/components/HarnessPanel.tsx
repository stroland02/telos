/**
 * HarnessPanel — the "ultimate harness" cockpit.
 *
 * One glance at which harnesses are installed (ECC / Superpowers / Headroom),
 * how many capabilities Telos curates from each, and whether the pinned lock
 * has drifted. Makes the embedded harness legible while vibe-coding.
 *
 * Modeled on ProcessPanel: role="dialog" aria-modal, Esc + backdrop close,
 * focus to the refresh button on open. Token-styled, no hard-coded hex.
 */

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { TelosApi } from "../api/client";
import { HarnessStatus } from "../api/types";

export function HarnessPanel({
  open, api, onClose,
}: { open: boolean; api: TelosApi; onClose: () => void }) {
  const refreshRef = useRef<HTMLButtonElement>(null);
  const [status, setStatus] = useState<HarnessStatus | null>(null);
  const [enabled, setEnabled] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    api.harnessStatus()
      .then(setStatus)
      .catch(() => setStatus(null))
      .finally(() => setLoading(false));
    api.harnessConfig().then((c) => setEnabled(c.enabled)).catch(() => setEnabled([]));
  }, [api]);

  const toggle = useCallback((source: string) => {
    const on = !enabled.includes(source);
    api.harnessSelect(source, on).then((c) => setEnabled(c.enabled)).catch(() => {});
  }, [api, enabled]);

  useEffect(() => {
    if (!open) return;
    refresh();
    refreshRef.current?.focus();
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose, refresh]);

  if (!open) return null;

  const drift = status?.drift;
  const driftLabel = !drift ? "" : drift.status === "drift"
    ? `drift — ${drift.missing.length} missing, ${drift.added.length} new`
    : "ok";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Harness cockpit"
      onClick={onClose}
      style={{
        position: "absolute", inset: 0, zIndex: 40,
        background: "color-mix(in srgb, var(--bg) 70%, transparent)",
        display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "12vh",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 560, maxWidth: "92vw", maxHeight: "72vh", display: "flex", flexDirection: "column",
          background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-md, 8px)",
          boxShadow: "var(--shadow-panel)", overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", padding: "var(--s-3)", borderBottom: "1px solid var(--border)" }}>
          <span style={{ flex: 1, fontFamily: "var(--font-ui)", fontSize: "var(--t-body-size, 14px)", color: "var(--text)" }}>
            Harness <span style={{ color: "var(--text-faint)" }}>(orchestrate + curate)</span>
          </span>
          <button ref={refreshRef} onClick={refresh} style={btn(true)}>Refresh</button>
        </div>

        <div style={{ overflowY: "auto", padding: "var(--s-2)" }}>
          {loading && <Empty text="Loading…" />}
          {!loading && !status && (
            <Empty text="No harness data. Is the server running?" />
          )}
          {!loading && status && (
            <>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-mono)", fontSize: "var(--t-meta-size)" }}>
                <thead>
                  <tr style={{ color: "var(--text-faint)", textAlign: "left" }}>
                    <Th>Harness</Th><Th right>Agents</Th><Th right>Active</Th>
                  </tr>
                </thead>
                <tbody>
                  {status.installed.map((h) => {
                    const on = enabled.includes(h.source);
                    const isOpen = expanded === h.source;
                    const caps = h.capabilities ?? [];
                    return (
                      <Fragment key={h.source}>
                        <tr style={{ borderTop: "1px solid var(--border)", color: "var(--text)" }}>
                          <Td title={h.repo}>
                            <button
                              onClick={() => setExpanded(isOpen ? null : h.source)}
                              aria-expanded={isOpen}
                              aria-label={`${isOpen ? "Hide" : "Show"} ${h.source} agents`}
                              style={{
                                cursor: "pointer", background: "none", border: "none", padding: 0, font: "inherit",
                                color: "var(--text)", display: "inline-flex", alignItems: "center", gap: 6,
                              }}
                            >
                              <span style={{ color: "var(--text-faint)", width: 8, display: "inline-block" }}>{isOpen ? "▾" : "▸"}</span>
                              {h.title}
                            </button>
                          </Td>
                          <Td right>{caps.length}</Td>
                          <Td right>
                            <button
                              onClick={() => toggle(h.source)}
                              aria-pressed={on}
                              aria-label={`${on ? "Disable" : "Enable"} ${h.source}`}
                              style={{
                                cursor: "pointer", borderRadius: "var(--r-sm)", padding: "1px 8px", fontFamily: "var(--font-mono)", fontSize: 11,
                                background: on ? "var(--accent-soft)" : "none",
                                border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`,
                                color: on ? "var(--accent)" : "var(--text-muted)", outline: "none",
                              }}
                            >
                              {on ? "on" : "off"}
                            </button>
                          </Td>
                        </tr>
                        {isOpen && (
                          <tr style={{ color: "var(--text)" }}>
                            <td colSpan={3} style={{ padding: "0 var(--s-2) var(--s-2) 22px" }}>
                              {caps.length === 0 && <span style={{ color: "var(--text-faint)", fontStyle: "italic" }}>No agents curated from this harness yet.</span>}
                              {caps.map((c) => (
                                <div key={c.id} style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "2px 0" }}>
                                  <span style={{ color: c.activation === "prompt" ? "var(--accent)" : "var(--text-muted)", fontSize: 10, width: 38, flexShrink: 0 }}>
                                    {c.kind}
                                  </span>
                                  <span style={{ color: "var(--text)", flexShrink: 0 }}>{c.id}</span>
                                  <span style={{ color: "var(--text-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {c.title}{c.triggers?.length ? ` · fires on: ${c.triggers.slice(0, 4).join(", ")}` : ""}
                                  </span>
                                </div>
                              ))}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ padding: "var(--s-3) var(--s-2)", fontSize: "var(--t-meta-size)", color: "var(--text-muted)", fontFamily: "var(--font-ui)" }}>
                <div>{status.totals.nodeCapabilities} node-context capabilities · {status.totals.promptIntents} prompt intents</div>
                <div>Lock: {status.lock.present ? "present" : "absent — run telos doctor"}</div>
                <div>Drift: <span style={{ color: drift?.status === "drift" ? "var(--warn, #d29922)" : "var(--ok, #3fb950)" }}>{driftLabel}</span></div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th style={{ padding: "var(--s-1) var(--s-2)", fontWeight: 600, textAlign: right ? "right" : "left" }}>{children}</th>;
}
function Td({ children, right, title }: { children: React.ReactNode; right?: boolean; title?: string }) {
  return <td title={title} style={{ padding: "var(--s-1) var(--s-2)", textAlign: right ? "right" : "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 360 }}>{children}</td>;
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

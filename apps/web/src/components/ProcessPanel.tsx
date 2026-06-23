/**
 * ProcessPanel — the Phase 2 B1 "advanced task manager" surface.
 *
 * Shows the latest local process snapshot (CPU-sorted) with CPU% and memory.
 * Processes that were joined to a graph node (their command line referenced a
 * file path) show a "↳ node" affordance that opens that node on the map.
 *
 * Modeled on AskPanel: role="dialog" aria-modal, Esc + backdrop close, focus
 * moved to the refresh button on open. Token-styled, no hard-coded hex.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { TelosApi } from "../api/client";
import { ProcessSample } from "../api/types";

export function ProcessPanel({
  open, api, onOpenNode, onClose,
}: { open: boolean; api: TelosApi; onOpenNode: (id: string) => void; onClose: () => void }) {
  const refreshRef = useRef<HTMLButtonElement>(null);
  const [procs, setProcs] = useState<ProcessSample[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    api.processes(100)
      .then(setProcs)
      .catch(() => setProcs([]))
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

  const openProc = (id: string) => { onOpenNode(id); onClose(); };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Local processes"
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
          width: 620, maxWidth: "92vw", maxHeight: "72vh", display: "flex", flexDirection: "column",
          background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-md, 8px)",
          boxShadow: "var(--shadow-panel)", overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", padding: "var(--s-3)", borderBottom: "1px solid var(--border)" }}>
          <span style={{ flex: 1, fontFamily: "var(--font-ui)", fontSize: "var(--t-body-size, 14px)", color: "var(--text)" }}>
            Processes <span style={{ color: "var(--text-faint)" }}>({procs.length})</span>
          </span>
          <button ref={refreshRef} onClick={refresh} style={btn(true)}>Refresh</button>
        </div>

        <div style={{ overflowY: "auto", padding: "var(--s-2)" }}>
          {loading && <Empty text="Loading…" />}
          {!loading && procs.length === 0 && (
            <Empty text="No process data. Run `telos top` (or `telos top --demo`) to push a snapshot." />
          )}
          {!loading && procs.length > 0 && (
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-mono)", fontSize: "var(--t-meta-size)" }}>
              <thead>
                <tr style={{ color: "var(--text-faint)", textAlign: "left" }}>
                  <Th>PID</Th><Th>Process</Th><Th right>CPU%</Th><Th right>Mem MB</Th><Th>Node</Th>
                </tr>
              </thead>
              <tbody>
                {procs.map((p) => (
                  <tr key={p.pid} style={{ borderTop: "1px solid var(--border)", color: "var(--text)" }}>
                    <Td>{p.pid}</Td>
                    <Td title={p.cmd ?? p.name}>{p.name}</Td>
                    <Td right>{p.cpu.toFixed(1)}</Td>
                    <Td right>{Math.round(p.memMb)}</Td>
                    <Td>
                      {p.nodeId ? (
                        <button
                          onClick={() => openProc(p.nodeId!)}
                          title="Open this process's code node"
                          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--accent)", font: "inherit", outline: "none" }}
                        >
                          ↳ open
                        </button>
                      ) : (
                        <span style={{ color: "var(--text-faint)" }}>—</span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
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
  return <td title={title} style={{ padding: "var(--s-1) var(--s-2)", textAlign: right ? "right" : "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 260 }}>{children}</td>;
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

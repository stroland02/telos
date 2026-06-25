/**
 * ResolutionsPanel — lists the findings from `telos resolve`, grouped by
 * severity. Clicking a finding opens its node on the map. Read-only.
 *
 * Modeled on ProcessPanel: role="dialog" aria-modal, Esc + backdrop close.
 * Token-styled, no hard-coded hex (except the severity dots, intentional).
 */

import { Finding } from "../api/types";
import { Panel } from "./ui";

const SEV_RANK: Record<string, number> = { error: 3, warn: 2, info: 1 };
const SEV_COLOR: Record<string, string> = { error: "var(--danger, #f85149)", warn: "var(--warn, #d29922)", info: "var(--accent)" };

export function ResolutionsPanel({
  open, findings, onOpenNode, onClose,
}: { open: boolean; findings: Finding[]; onOpenNode: (id: string) => void; onClose: () => void }) {
  const sorted = [...findings].sort((a, b) => (SEV_RANK[b.severity] ?? 0) - (SEV_RANK[a.severity] ?? 0));
  const openFinding = (id: string) => { onOpenNode(id); onClose(); };

  return (
    <Panel open={open} onClose={onClose} ariaLabel="Resolutions" width={640} paddingTop="10vh">
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", padding: "var(--s-3)", borderBottom: "1px solid var(--border)" }}>
          <span style={{ flex: 1, fontFamily: "var(--font-ui)", fontSize: "var(--t-body-size, 14px)", color: "var(--text)" }}>
            Resolutions <span style={{ color: "var(--text-faint)" }}>({findings.length})</span>
          </span>
        </div>

        <div style={{ overflowY: "auto", padding: "var(--s-2)" }}>
          {sorted.length === 0 && (
            <div style={{ padding: "var(--s-3)", fontSize: "var(--t-meta-size)", color: "var(--text-faint)", fontStyle: "italic" }}>
              No findings. Run `telos resolve` (or `--driver stub`) to scan for resolutions.
            </div>
          )}
          {sorted.map((f, i) => (
            <button
              key={`${f.nodeId}-${i}`}
              onClick={() => openFinding(f.nodeId)}
              title="Open this finding's node"
              style={{
                width: "100%", textAlign: "left", display: "flex", flexDirection: "column", gap: 2,
                padding: "var(--s-2) var(--s-3)", marginBottom: "var(--s-1)", cursor: "pointer",
                background: "none", border: "1px solid var(--border)", borderLeft: `3px solid ${SEV_COLOR[f.severity] ?? "var(--border)"}`,
                borderRadius: "var(--r-sm)", color: "var(--text)", font: "inherit", outline: "none",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--surface-2)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "none"; }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: "var(--s-2)" }}>
                <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: SEV_COLOR[f.severity], flexShrink: 0 }} />
                <strong style={{ fontFamily: "var(--font-ui)", fontSize: "var(--t-label-size)" }}>{f.title}</strong>
                <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-faint)" }}>{f.agent}</span>
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-faint)" }}>{f.file}</span>
              {f.detail && <span style={{ fontSize: "var(--t-meta-size)", color: "var(--text-muted)" }}>{f.detail}</span>}
              {f.suggestion && <span style={{ fontSize: "var(--t-meta-size)", color: "var(--text)" }}>→ {f.suggestion}</span>}
            </button>
          ))}
        </div>
    </Panel>
  );
}

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
import { TokenSavings } from "../api/types";
import { Panel, Button, Badge } from "./ui";

const fmt = (n: number) => n.toLocaleString("en-US");

export function ContextPanel({
  open, api, onClose,
}: { open: boolean; api: TelosApi; onClose: () => void }) {
  const refreshRef = useRef<HTMLButtonElement>(null);
  const [brief, setBrief] = useState<string>("");
  const [savings, setSavings] = useState<TokenSavings | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    api.contextPack()
      .then(setBrief)
      .catch(() => setBrief(""))
      .finally(() => setLoading(false));
    api.measure().then(setSavings).catch(() => setSavings(null));
  }, [api]);

  useEffect(() => { if (open) refresh(); }, [open, refresh]);

  return (
    <Panel open={open} onClose={onClose} ariaLabel="Architecture context" width={680} paddingTop="10vh" initialFocus={refreshRef}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", padding: "var(--s-3)", borderBottom: "1px solid var(--border)" }}>
          <span style={{ flex: 1, fontFamily: "var(--font-ui)", fontSize: "var(--t-body-size, 14px)", color: "var(--text)" }}>
            Context <span style={{ color: "var(--text-faint)" }}>(graph-as-memory brief)</span>
          </span>
          <Button ref={refreshRef} variant="primary" onClick={refresh}>Refresh</Button>
        </div>

        {savings && savings.reductionPct > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", padding: "var(--s-2) var(--s-3)", borderBottom: "1px solid var(--border)", fontFamily: "var(--font-ui)", fontSize: "var(--t-meta-size)", color: "var(--text-muted)" }}>
            <Badge tone="accent">{savings.reductionPct.toFixed(1)}% fewer tokens</Badge>
            <span>
              ~{fmt(savings.packTokens)} tokens vs ~{fmt(savings.baselineTokens)} to read {savings.files} files cold
              {" "}· {savings.ratio.toFixed(0)}× smaller · ~${savings.costSavedUsd.toFixed(3)} saved / warm-start
            </span>
          </div>
        )}

        <div style={{ overflowY: "auto", padding: "var(--s-3)" }}>
          {loading && <Empty text="Loading…" />}
          {!loading && !brief && <Empty text="No context available. Is the server running on a scanned repo?" />}
          {!loading && brief && (
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "var(--font-mono)", fontSize: "var(--t-meta-size)", color: "var(--text)", lineHeight: 1.5 }}>
              {brief}
            </pre>
          )}
        </div>
    </Panel>
  );
}

function Empty({ text }: { text: string }) {
  return <div style={{ padding: "var(--s-3)", fontSize: "var(--t-meta-size)", color: "var(--text-faint)", fontStyle: "italic" }}>{text}</div>;
}

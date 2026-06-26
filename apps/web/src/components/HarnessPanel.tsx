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
import { HarnessStatus, ActivityFeed } from "../api/types";
import { Panel, Button, Badge } from "./ui";

export function HarnessPanel({
  open, api, onClose,
}: { open: boolean; api: TelosApi; onClose: () => void }) {
  const refreshRef = useRef<HTMLButtonElement>(null);
  const [status, setStatus] = useState<HarnessStatus | null>(null);
  const [enabled, setEnabled] = useState<string[]>([]);
  const [activity, setActivity] = useState<ActivityFeed | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    api.harnessStatus()
      .then(setStatus)
      .catch(() => setStatus(null))
      .finally(() => setLoading(false));
    api.harnessConfig().then((c) => setEnabled(c.enabled)).catch(() => setEnabled([]));
    api.harnessActivity().then(setActivity).catch(() => setActivity(null));
  }, [api]);

  const toggle = useCallback((source: string) => {
    const on = !enabled.includes(source);
    api.harnessSelect(source, on).then((c) => setEnabled(c.enabled)).catch(() => {});
  }, [api, enabled]);

  useEffect(() => { if (open) refresh(); }, [open, refresh]);

  const drift = status?.drift;
  const driftLabel = !drift ? "" : drift.status === "drift"
    ? `drift — ${drift.missing.length} missing, ${drift.added.length} new`
    : "ok";

  return (
    <Panel open={open} onClose={onClose} ariaLabel="Harness cockpit" width={560} initialFocus={refreshRef}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", padding: "var(--s-3)", borderBottom: "1px solid var(--border)" }}>
          <span style={{ flex: 1, fontFamily: "var(--font-ui)", fontSize: "var(--t-body-size, 14px)", color: "var(--text)" }}>
            Harness <span style={{ color: "var(--text-faint)" }}>(orchestrate + curate)</span>
          </span>
          <Button ref={refreshRef} variant="primary" onClick={refresh}>Refresh</Button>
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
              <ActivitySection feed={activity} />
            </>
          )}
        </div>
    </Panel>
  );
}

/** Recent orchestrations + an "agents fired" leaderboard — proof the harnesses
 *  are doing real work over time. Fed by GET /api/harness/activity. */
function ActivitySection({ feed }: { feed: ActivityFeed | null }) {
  const entries = feed?.entries ?? [];
  const tally = feed?.tally ?? [];
  return (
    <div style={{ borderTop: "1px solid var(--border)", padding: "var(--s-3) var(--s-2)", fontFamily: "var(--font-ui)" }}>
      <div style={{ color: "var(--text)", fontSize: "var(--t-body-size, 14px)", marginBottom: "var(--s-2)" }}>
        Activity <span style={{ color: "var(--text-faint)" }}>(recent orchestrations)</span>
      </div>
      {entries.length === 0 && (
        <div style={{ fontSize: "var(--t-meta-size)", color: "var(--text-faint)", fontStyle: "italic" }}>
          No orchestrations yet — Telos records each prompt it routes through the hook.
        </div>
      )}
      {tally.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: "var(--s-2)" }}>
          {tally.slice(0, 6).map((t) => (
            <Badge key={t.id} tone="accent">{t.id} · {t.count}</Badge>
          ))}
        </div>
      )}
      {entries.slice(0, 8).map((e, i) => (
        <div key={`${e.ts}-${i}`} style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "2px 0", fontFamily: "var(--font-mono)", fontSize: "var(--t-meta-size)" }}>
          <span style={{ color: "var(--text-faint)", flexShrink: 0, width: 56 }}>{relTime(e.ts)}</span>
          <span style={{ color: "var(--accent)", flexShrink: 0 }}>{e.intent}</span>
          <span style={{ color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {e.agents.join(", ")}
          </span>
        </div>
      ))}
    </div>
  );
}

function relTime(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th style={{ padding: "var(--s-1) var(--s-2)", fontWeight: 600, textAlign: right ? "right" : "left" }}>{children}</th>;
}
function Td({ children, right, title }: { children: React.ReactNode; right?: boolean; title?: string }) {
  return <td title={title} style={{ padding: "var(--s-1) var(--s-2)", textAlign: right ? "right" : "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 360 }}>{children}</td>;
}
function Empty({ text }: { text: string }) {
  return <div style={{ padding: "var(--s-3)", fontSize: "var(--t-meta-size)", color: "var(--text-faint)", fontStyle: "italic" }}>{text}</div>;
}

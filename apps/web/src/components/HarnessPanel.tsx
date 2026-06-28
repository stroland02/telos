/**
 * HarnessPanel — tabbed Telos control panel.
 *
 * Pinned header: Activate switch (self-managed engagement) + token-impact
 * summary + Refresh. Tab strip: Routing (activity feed) | Context (injected
 * context per prompt) | MCP (graph queries) | Impact (honest token math).
 * Keeps the per-harness on/off table at the top of the scrollable area.
 *
 * Token-styled, no hard-coded hex.
 */

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { TelosApi } from "../api/client";
import { HarnessStatus, ActivityFeed, McpActivityFeed, TokenSavings, UsageStats } from "../api/types";
import { Panel, Button, Badge, Switch, SegmentedControl } from "./ui";

type Tab = "routing" | "context" | "mcp" | "impact";

export function HarnessPanel({
  open, api, onClose,
}: { open: boolean; api: TelosApi; onClose: () => void }) {
  const refreshRef = useRef<HTMLButtonElement>(null);
  const [status, setStatus] = useState<HarnessStatus | null>(null);
  const [enabled, setEnabled] = useState<string[]>([]);
  const [activity, setActivity] = useState<ActivityFeed | null>(null);
  const [mcp, setMcp] = useState<McpActivityFeed | null>(null);
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [measure, setMeasure] = useState<TokenSavings | null>(null);
  const [engaged, setEngaged] = useState(false);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("routing");

  const refresh = useCallback(() => {
    setLoading(true);
    api.harnessStatus().then(setStatus).catch(() => setStatus(null)).finally(() => setLoading(false));
    api.harnessConfig().then((c) => setEnabled(c.enabled)).catch(() => setEnabled([]));
    api.harnessActivity().then(setActivity).catch(() => setActivity(null));
    api.mcpActivity().then(setMcp).catch(() => setMcp(null));
    api.usage().then(setUsage).catch(() => setUsage(null));
    api.measure().then(setMeasure).catch(() => setMeasure(null));
    api.activationState().then((s) => setEngaged(!!s.statusLinePresent)).catch(() => {});
  }, [api]);

  const toggle = useCallback((source: string) => {
    const on = !enabled.includes(source);
    api.harnessSelect(source, on).then((c) => setEnabled(c.enabled)).catch(() => {});
  }, [api, enabled]);

  const toggleEngaged = useCallback((next: boolean) => {
    api.activate(!next).then((s) => setEngaged(!!s.statusLinePresent)).catch(() => {});
  }, [api]);

  useEffect(() => { if (open) refresh(); }, [open, refresh]);

  // Live feed while open: poll the two cheap feeds (activity + mcp) every 4 s
  // so new orchestrations and graph queries appear without a manual Refresh.
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => {
      api.harnessActivity().then(setActivity).catch(() => {});
      api.mcpActivity().then(setMcp).catch(() => {});
      api.usage().then(setUsage).catch(() => {});
    }, 4000);
    return () => clearInterval(id);
  }, [open, api]);

  const injected = (activity?.entries ?? []).reduce((s, e) => s + (e.injectedTokens ?? 0), 0);
  const saved = measure?.baselineTokens != null && measure?.packTokens != null
    ? Math.max(0, measure.baselineTokens - measure.packTokens) : 0;
  const fmt = (n: number) => n.toLocaleString("en-US");

  // Usage funnel: distinct agents actually routed recently (dynamic) vs. the
  // curated pool. `usedById` drives the per-agent ●/○ markers; `usedBySource`
  // the per-harness Used count + idle flag (enabled but never used = prunable).
  const usedById = new Map((usage?.agents ?? []).map((a) => [a.id, a]));
  const usedCountForSource = (source: string) =>
    (usage?.agents ?? []).filter((a) => a.id.split(":")[0] === source).length;
  const activeAgents = usage?.agents.length ?? 0;
  const curatedTotal = status ? status.totals.nodeCapabilities + status.totals.promptIntents : 0;

  const drift = status?.drift;
  const driftLabel = !drift ? "" : drift.status === "drift"
    ? `drift — ${drift.missing.length} missing, ${drift.added.length} new`
    : "ok";

  return (
    <Panel open={open} onClose={onClose} ariaLabel="Harness control panel" width={560} initialFocus={refreshRef}>
      {/* Pinned header: Activate switch + impact summary + refresh */}
      <div style={{ padding: "var(--s-3)", borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "var(--s-2)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)" }}>
          <span style={{ flex: 1, fontFamily: "var(--font-ui)", color: "var(--text)" }}>
            Telos <span style={{ color: "var(--text-faint)" }}>control panel</span>
          </span>
          <Switch checked={engaged} onChange={toggleEngaged} label="Telos engaged" />
          <Button ref={refreshRef} variant="primary" onClick={refresh}>Refresh</Button>
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--t-meta-size)", color: "var(--text-muted)" }}>
          ↓ {fmt(injected)} tok injected · ↑ {fmt(saved)} tok saved
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--t-meta-size)", color: "var(--text-muted)" }}>
          {activeAgents} of {curatedTotal} agents active <span style={{ color: "var(--text-faint)" }}>(last {usage?.windowPrompts ?? 0} routed prompts)</span>
        </div>
      </div>

      <div style={{ overflowY: "auto", padding: "var(--s-2)" }}>
        {loading && <Empty text="Loading…" />}
        {!loading && !status && <Empty text="No harness data. Is the server running?" />}
        {!loading && status && (
          <>
            {/* Harness on/off table */}
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-mono)", fontSize: "var(--t-meta-size)" }}>
              <thead>
                <tr style={{ color: "var(--text-faint)", textAlign: "left" }}>
                  <Th>Harness</Th><Th right>Used/Curated</Th><Th right>Active</Th>
                </tr>
              </thead>
              <tbody>
                {status.installed.map((h) => {
                  const on = enabled.includes(h.source);
                  const isOpen = expanded === h.source;
                  const caps = h.capabilities ?? [];
                  const used = usedCountForSource(h.source);
                  const idle = on && used === 0; // enabled but unused → prune candidate
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
                          {idle && (
                            <span
                              title="idle — enabled but unused recently; disable to trim routing"
                              style={{ marginLeft: 6, padding: "0 6px", borderRadius: "var(--r-sm)", fontSize: 10, color: "var(--warn)", border: "1px solid var(--warn)" }}
                            >idle</span>
                          )}
                        </Td>
                        <Td right title={`${used} of ${caps.length} curated used recently`}>{used} / {caps.length}</Td>
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
                            {caps.length === 0 && (
                              <span style={{ color: "var(--text-faint)", fontStyle: "italic" }}>
                                No agents curated from this harness yet.
                              </span>
                            )}
                            {caps.map((c) => {
                              const u = usedById.get(c.id);
                              return (
                                <div key={c.id} style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "2px 0" }}>
                                  <span
                                    title={u ? `used ${u.count}× recently` : "idle — not routed recently"}
                                    style={{ color: u ? "var(--ok)" : "var(--text-faint)", fontSize: 10, width: 48, flexShrink: 0 }}
                                  >
                                    {u ? `● ${u.count}×` : "○ idle"}
                                  </span>
                                  <span style={{ color: c.activation === "prompt" ? "var(--accent)" : "var(--text-muted)", fontSize: 10, width: 38, flexShrink: 0 }}>
                                    {c.kind}
                                  </span>
                                  <span style={{ color: "var(--text)", flexShrink: 0 }}>{c.id}</span>
                                  <span style={{ color: "var(--text-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {c.title}{c.triggers?.length ? ` · fires on: ${c.triggers.slice(0, 4).join(", ")}` : ""}
                                  </span>
                                </div>
                              );
                            })}
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
              <div>Drift: <span style={{ color: drift?.status === "drift" ? "var(--warn)" : "var(--ok)" }}>{driftLabel}</span></div>
            </div>

            <div style={{ padding: "var(--s-2) 0" }}>
              <SegmentedControl
                ariaLabel="Background signal"
                idBase="harness-tab"
                value={tab}
                onChange={(v) => setTab(v as Tab)}
                options={[
                  { value: "routing", label: "Routing" },
                  { value: "context", label: "Context" },
                  { value: "mcp", label: "MCP" },
                  { value: "impact", label: "Impact" },
                ]}
              />
            </div>

            {tab === "routing" && <ActivitySection feed={activity} />}
            {tab === "context" && <ContextSection feed={activity} />}
            {tab === "mcp" && <McpSection feed={mcp} />}
            {tab === "impact" && <ImpactSection injected={injected} saved={saved} mcp={mcp} measure={measure} />}
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

/** Context tab: what the hook injected per prompt + its token cost. */
function ContextSection({ feed }: { feed: ActivityFeed | null }) {
  const entries = (feed?.entries ?? []).filter((e) => e.block || e.injectedTokens != null);
  if (entries.length === 0) {
    return <Empty text="No injected context yet — Telos records each prompt it routes." />;
  }
  return (
    <div style={{ padding: "var(--s-2)" }}>
      {entries.slice(0, 8).map((e, i) => (
        <details key={`${e.ts}-${i}`} style={{ borderTop: "1px solid var(--border)", padding: "var(--s-1) 0" }}>
          <summary style={{ cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: "var(--t-meta-size)", color: "var(--text)" }}>
            <span style={{ color: "var(--accent)" }}>{e.intent}</span> · {(e.injectedTokens ?? 0).toLocaleString("en-US")} tok
          </summary>
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", margin: "var(--s-1) 0 0" }}>
            {e.block ?? "(block not recorded)"}
          </pre>
        </details>
      ))}
    </div>
  );
}

/** MCP tab: every graph query the agent made instead of reading files. */
function McpSection({ feed }: { feed: McpActivityFeed | null }) {
  const entries = feed?.entries ?? [];
  if (entries.length === 0) {
    return <Empty text="No MCP queries yet — they appear as the agent explores the graph." />;
  }
  return (
    <div style={{ padding: "var(--s-2)" }}>
      <div style={{ marginBottom: "var(--s-2)" }}>
        <Badge tone="accent">{feed!.totals.queries} queries · {feed!.totals.tokens.toLocaleString("en-US")} tok served</Badge>
      </div>
      {entries.slice(0, 12).map((e, i) => (
        <div key={`${e.ts}-${i}`} style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "2px 0", fontFamily: "var(--font-mono)", fontSize: "var(--t-meta-size)" }}>
          <span style={{ color: "var(--text-faint)", width: 56, flexShrink: 0 }}>{relTime(e.ts)}</span>
          <span style={{ color: "var(--accent)", flexShrink: 0 }}>{e.tool}</span>
          <span style={{ color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{e.argsSummary}</span>
          <span style={{ color: "var(--text-faint)", flexShrink: 0 }}>{e.resultTokens} tok</span>
        </div>
      ))}
    </div>
  );
}

/** Impact tab: the honest tokenization story. */
function ImpactSection({
  injected, saved, mcp, measure,
}: { injected: number; saved: number; mcp: McpActivityFeed | null; measure: TokenSavings | null }) {
  const fmt = (n: number) => n.toLocaleString("en-US");
  return (
    <div style={{ padding: "var(--s-2)", fontFamily: "var(--font-ui)", fontSize: "var(--t-meta-size)", color: "var(--text-muted)", lineHeight: 1.7 }}>
      <div>Injected this session: <b style={{ color: "var(--text)" }}>{fmt(injected)}</b> tok across recent prompts</div>
      <div>Warm-start brief saves: <b style={{ color: "var(--text)" }}>{fmt(saved)}</b> tok vs cold read{measure ? ` (${measure.ratio.toFixed(1)}× smaller)` : ""}</div>
      <div>MCP served on demand: <b style={{ color: "var(--text)" }}>{fmt(mcp?.totals.tokens ?? 0)}</b> tok over {mcp?.totals.queries ?? 0} queries</div>
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

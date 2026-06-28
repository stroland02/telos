import { Capability, CapabilityKind, CapabilitySource } from "./capability.js";
import { PromptCapability } from "./router.js";
import { HarnessInstall } from "./setup.js";
import { HarnessLock } from "./lock.js";
import { DriftReport, diffLock } from "./doctor.js";
import type { HarnessRoster } from "./discover.js";
import type { UsageStats } from "./activity.js";

// One curated agent/skill a harness provides — the row the details view lists.
// `activation` tells you HOW Telos picks it: "node" = matched from a code node's
// graph context (layer/language/path), "prompt" = matched from the words you type
// (the `triggers`, which the UserPromptSubmit hook routes on).
export interface HarnessCapabilityRow {
  id: string;
  title: string;
  kind: CapabilityKind; // "agent" | "skill"
  activation: "node" | "prompt";
  triggers?: string[]; // present for prompt-activated capabilities
}

// One installed harness, with how many node-context capabilities Telos curates
// from it ("what powers do I have") plus the full roster for the details view.
export interface HarnessSourceStatus {
  source: CapabilitySource;
  title: string;
  repo: string;
  nodeCapabilities: number;
  capabilities: HarnessCapabilityRow[];
}

// The cockpit's single source of truth: what's installed, how much is enabled,
// and whether the pinned lock has drifted from the live catalog.
export interface HarnessStatus {
  installed: HarnessSourceStatus[];
  totals: { nodeCapabilities: number; promptIntents: number };
  drift: DriftReport;
  lock: { present: boolean; path: string };
}

// The unified count model: Installed (on disk) → Curated (Telos can route) →
// Used (actually dispatched in the recent window). `idle` = enabled yet unused,
// the prune-to-save-context signal the panel surfaces.
export interface HarnessFunnelRow {
  source: CapabilitySource;
  title: string;
  installed: number;
  curated: number;
  usedRecent: number; // distinct agents from this source used in the window
  lastUsedTs: number | null;
  enabled: boolean;
  idle: boolean;
}
export interface HarnessFunnel {
  rows: HarnessFunnelRow[];
  totals: { usedAgents: number; curated: number; installed: number };
}

/** Combine the static cockpit status with rolling usage + the enabled set. */
export function buildFunnel(status: HarnessStatus, usage: UsageStats, enabled: string[]): HarnessFunnel {
  const enabledSet = new Set(enabled);
  const rows: HarnessFunnelRow[] = status.installed.map((h) => {
    const used = usage.agents.filter((a) => a.id.split(":")[0] === h.source);
    const isEnabled = enabledSet.has(h.source);
    const usedRecent = used.length;
    return {
      source: h.source,
      title: h.title,
      installed: h.nodeCapabilities,
      curated: h.capabilities.length,
      usedRecent,
      lastUsedTs: used.length ? Math.max(...used.map((a) => a.lastTs)) : null,
      enabled: isEnabled,
      idle: isEnabled && usedRecent === 0,
    };
  });
  return {
    rows,
    totals: {
      usedAgents: usage.agents.length,
      curated: rows.reduce((n, r) => n + r.curated, 0),
      installed: rows.reduce((n, r) => n + r.installed, 0),
    },
  };
}

/** Pure aggregate over the catalogs + lock. `lock` null = no lockfile present. */
export function buildHarnessStatus(args: {
  lockPath: string;
  lock: HarnessLock | null;
  nodeCatalog: Capability[];
  promptCatalog: PromptCapability[];
  installs: HarnessInstall[];
  roster?: HarnessRoster;
}): HarnessStatus {
  const { lockPath, lock, nodeCatalog, promptCatalog, installs, roster } = args;
  // When a live roster is supplied, the per-harness capability count reflects what
  // is actually installed on disk (agents + skills) rather than the curated catalog.
  const liveCount = (source: CapabilitySource): number | undefined => {
    const info = roster?.sources.find((s) => s.source === source && s.state === "installed");
    return info ? info.counts.agents + info.counts.skills : undefined;
  };
  const rosterFor = (source: CapabilitySource): HarnessCapabilityRow[] => [
    ...nodeCatalog
      .filter((c) => c.source === source)
      .map((c): HarnessCapabilityRow => ({ id: c.id, title: c.title, kind: c.kind, activation: "node" })),
    ...promptCatalog
      .filter((c) => c.source === source)
      .map((c): HarnessCapabilityRow => ({ id: c.id, title: c.title, kind: c.kind, activation: "prompt", triggers: c.triggers })),
  ];
  const installed: HarnessSourceStatus[] = installs.map((i) => ({
    source: i.source,
    title: i.title,
    repo: i.repo,
    nodeCapabilities: liveCount(i.source) ?? nodeCatalog.filter((c) => c.source === i.source).length,
    capabilities: rosterFor(i.source),
  }));
  const drift: DriftReport = lock
    ? diffLock(lock, nodeCatalog)
    : { status: "ok", missing: [], added: [] };
  return {
    installed,
    totals: { nodeCapabilities: nodeCatalog.length, promptIntents: promptCatalog.length },
    drift,
    lock: { present: lock !== null, path: lockPath },
  };
}

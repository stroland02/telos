import { Capability, CapabilityKind, CapabilitySource } from "./capability.js";
import { PromptCapability } from "./router.js";
import { HarnessInstall } from "./setup.js";
import { HarnessLock } from "./lock.js";
import { DriftReport, diffLock } from "./doctor.js";
import type { HarnessRoster } from "./discover.js";

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

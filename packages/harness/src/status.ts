import { Capability, CapabilitySource } from "./capability.js";
import { PromptCapability } from "./router.js";
import { HarnessInstall } from "./setup.js";
import { HarnessLock } from "./lock.js";
import { DriftReport, diffLock } from "./doctor.js";

// One installed harness, with how many node-context capabilities Telos curates
// from it — the "what powers do I have" row.
export interface HarnessSourceStatus {
  source: CapabilitySource;
  title: string;
  repo: string;
  nodeCapabilities: number;
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
}): HarnessStatus {
  const { lockPath, lock, nodeCatalog, promptCatalog, installs } = args;
  const installed: HarnessSourceStatus[] = installs.map((i) => ({
    source: i.source,
    title: i.title,
    repo: i.repo,
    nodeCapabilities: nodeCatalog.filter((c) => c.source === i.source).length,
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

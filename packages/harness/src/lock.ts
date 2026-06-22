import { Capability } from "./capability.js";

/**
 * The harness lockfile records which capability ids the curation layer was
 * pinned against. `telos doctor` compares it to the live catalog to detect
 * drift (a referenced capability that was removed or renamed upstream).
 */
export interface HarnessLock {
  version: 1;
  capabilities: string[]; // sorted capability ids
}

export function buildLock(catalog: Capability[]): HarnessLock {
  return { version: 1, capabilities: catalog.map((c) => c.id).slice().sort() };
}

export function serializeLock(lock: HarnessLock): string {
  return JSON.stringify(lock, null, 2) + "\n";
}

export function parseLock(text: string): HarnessLock {
  const data = JSON.parse(text);
  if (data?.version !== 1 || !Array.isArray(data.capabilities) || !data.capabilities.every((c: unknown) => typeof c === "string")) {
    throw new Error("invalid harness.lock: expected { version: 1, capabilities: string[] }");
  }
  return { version: 1, capabilities: data.capabilities };
}

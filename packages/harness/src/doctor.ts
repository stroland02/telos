import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Capability } from "./capability.js";
import { DEFAULT_CATALOG } from "./catalog.js";
import { HarnessLock, buildLock, parseLock, serializeLock } from "./lock.js";

export type DriftStatus = "ok" | "drift";

export interface DriftReport {
  status: DriftStatus;
  missing: string[]; // locked ids no longer present in the catalog (removed/renamed = drift)
  added: string[];   // catalog ids not yet in the lock (new capabilities)
}

/** Pure drift diff: compares a lock to the current catalog. Never throws. */
export function diffLock(lock: HarnessLock, catalog: Capability[]): DriftReport {
  const lockSet = new Set(lock.capabilities);
  const catSet = new Set(catalog.map((c) => c.id));
  const missing = [...lockSet].filter((id) => !catSet.has(id)).sort();
  const added = [...catSet].filter((id) => !lockSet.has(id)).sort();
  return { status: missing.length === 0 && added.length === 0 ? "ok" : "drift", missing, added };
}

export interface DoctorResult {
  initialized: boolean; // true if the lock was just created this run
  report: DriftReport;
  lockPath: string;
}

/**
 * Read `lockPath` and diff it against the catalog. If the lock is absent, write
 * it from the current catalog (bootstrap) and report ok. Side effects are limited
 * to reading/writing the lockfile; it never throws on drift.
 */
export function runDoctor(lockPath: string, catalog: Capability[] = DEFAULT_CATALOG): DoctorResult {
  if (!existsSync(lockPath)) {
    const lock = buildLock(catalog);
    mkdirSync(dirname(lockPath), { recursive: true });
    writeFileSync(lockPath, serializeLock(lock));
    return { initialized: true, report: { status: "ok", missing: [], added: [] }, lockPath };
  }
  const lock = parseLock(readFileSync(lockPath, "utf-8"));
  return { initialized: false, report: diffLock(lock, catalog), lockPath };
}

import { describe, it, expect } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync, existsSync, readFileSync } from "node:fs";
import { Capability } from "./capability.js";
import { buildLock } from "./lock.js";
import { diffLock, runDoctor } from "./doctor.js";

const cap = (id: string): Capability => ({ id, kind: "agent", source: "ecc", title: id, match: { languages: ["x"] } });

describe("diffLock", () => {
  it("reports ok when lock matches catalog", () => {
    const catalog = [cap("ecc:a"), cap("ecc:b")];
    expect(diffLock(buildLock(catalog), catalog)).toEqual({ status: "ok", missing: [], added: [] });
  });
  it("reports missing when a locked capability is gone from the catalog", () => {
    const lock = buildLock([cap("ecc:a"), cap("ecc:gone")]);
    const r = diffLock(lock, [cap("ecc:a")]);
    expect(r.status).toBe("drift");
    expect(r.missing).toEqual(["ecc:gone"]);
    expect(r.added).toEqual([]);
  });
  it("reports added when the catalog has a new capability", () => {
    const lock = buildLock([cap("ecc:a")]);
    const r = diffLock(lock, [cap("ecc:a"), cap("ecc:new")]);
    expect(r.status).toBe("drift");
    expect(r.added).toEqual(["ecc:new"]);
  });
});

describe("runDoctor", () => {
  const dir = join(tmpdir(), "telos-doctor-test");
  const lockPath = join(dir, ".telos", "harness.lock");

  it("initializes the lock when absent, then detects drift on the next run", () => {
    rmSync(dir, { recursive: true, force: true });

    // First run: bootstrap.
    const first = runDoctor(lockPath, [cap("ecc:a"), cap("ecc:b")]);
    expect(first.initialized).toBe(true);
    expect(first.report.status).toBe("ok");
    expect(existsSync(lockPath)).toBe(true);
    expect(readFileSync(lockPath, "utf-8")).toContain("ecc:a");

    // Second run with a changed catalog: drift (ecc:b removed, ecc:c added).
    const second = runDoctor(lockPath, [cap("ecc:a"), cap("ecc:c")]);
    expect(second.initialized).toBe(false);
    expect(second.report.status).toBe("drift");
    expect(second.report.missing).toEqual(["ecc:b"]);
    expect(second.report.added).toEqual(["ecc:c"]);

    rmSync(dir, { recursive: true, force: true });
  });
});

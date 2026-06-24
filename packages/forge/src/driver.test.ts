import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stubDriver, BuildCheckpoint } from "./driver.js";

let dir: string;
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

describe("stubDriver", () => {
  it("writes a .ts file, emits a checkpoint, and returns success", async () => {
    dir = mkdtempSync(join(tmpdir(), "telos-stub-"));
    const seen: BuildCheckpoint[] = [];
    const res = await stubDriver.run({
      intent: "anything", repoDir: dir, branch: "telos/forge/x",
      maxTurns: 5, maxBudgetUsd: 1, signal: new AbortController().signal,
      onCheckpoint: (c) => { seen.push(c); },
    });
    expect(stubDriver.id).toBe("stub");
    expect(res.stop).toBe("success");
    expect(existsSync(join(dir, "forge_stub.ts"))).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0].turn).toBe(1);
  });
});

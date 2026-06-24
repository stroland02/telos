import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { stubDriver } from "./driver.js";
import { runForge, ForgeDiffEvent } from "./forge.js";

const run = promisify(execFile);
let dir: string;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "telos-forge-"));
  await run("git", ["init", "-b", "main"], { cwd: dir });
  await run("git", ["config", "user.email", "t@t.dev"], { cwd: dir });
  await run("git", ["config", "user.name", "T"], { cwd: dir });
  writeFileSync(join(dir, "a.ts"), "export function a() { return 1; }\n");
  await run("git", ["add", "."], { cwd: dir });
  await run("git", ["commit", "-m", "init"], { cwd: dir });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("runForge", () => {
  it("runs the loop on a forge branch, reflects a diff, and restores the base branch", async () => {
    const events: ForgeDiffEvent[] = [];
    const res = await runForge({
      intent: "add forge stub", repoDir: dir, driver: stubDriver,
      onDiff: (e) => { events.push(e); },
    });

    expect(res.stop).toBe("success");
    expect(res.branch).toBe("telos/forge/add-forge-stub");
    expect(res.baseBranch).toBe("main");
    expect(res.commits).toBe(1);
    // the stub's new file shows up as an added node in the reflected diff
    expect(events.length).toBe(1);
    expect(events[0].diff.added.nodes.length).toBeGreaterThan(0);

    // base branch restored, served db never written, forge branch holds the work
    const { stdout: branch } = await run("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: dir });
    expect(branch.trim()).toBe("main");
    expect(existsSync(join(dir, ".telos", "graph.db"))).toBe(false);
    expect(existsSync(join(dir, "forge_stub.ts"))).toBe(false); // not on main
    const { stdout: branches } = await run("git", ["branch"], { cwd: dir });
    expect(branches).toContain("telos/forge/add-forge-stub");
  });

  it("refuses to run on a dirty working tree", async () => {
    writeFileSync(join(dir, "dirty.ts"), "export function d() { return 0; }\n");
    await expect(runForge({ intent: "x", repoDir: dir, driver: stubDriver }))
      .rejects.toThrow(/working tree not clean/i);
  });
});

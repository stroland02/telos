import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { runForgeCli } from "./main.js";

const run = promisify(execFile);
let dir: string;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "telos-cli-forge-"));
  await run("git", ["init", "-b", "main"], { cwd: dir });
  await run("git", ["config", "user.email", "t@t.dev"], { cwd: dir });
  await run("git", ["config", "user.name", "T"], { cwd: dir });
  writeFileSync(join(dir, "a.ts"), "export function a() { return 1; }\n");
  await run("git", ["add", "."], { cwd: dir });
  await run("git", ["commit", "-m", "init"], { cwd: dir });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("runForgeCli", () => {
  it("runs the stub driver and posts the diff best-effort", async () => {
    const posts: string[] = [];
    const fakeFetch = (async (url: string) => { posts.push(String(url)); return { ok: true } as Response; }) as unknown as typeof fetch;
    const res = await runForgeCli({ intent: "add stub", path: dir, driver: "stub", fetchImpl: fakeFetch });
    expect(res.stop).toBe("success");
    expect(res.branch).toBe("telos/forge/add-stub");
    expect(posts.some((u) => u.endsWith("/v1/forge/diff"))).toBe(true);
  });
});

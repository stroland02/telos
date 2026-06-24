import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { slugify, currentBranch, isClean, createAndCheckout, checkout, commitAll } from "./git.js";

const run = promisify(execFile);
let dir: string;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "telos-git-"));
  await run("git", ["init", "-b", "main"], { cwd: dir });
  await run("git", ["config", "user.email", "t@t.dev"], { cwd: dir });
  await run("git", ["config", "user.name", "T"], { cwd: dir });
  writeFileSync(join(dir, "a.txt"), "1\n");
  await run("git", ["add", "."], { cwd: dir });
  await run("git", ["commit", "-m", "init"], { cwd: dir });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("git helpers", () => {
  it("slugify normalizes intent text", () => {
    expect(slugify("Add a /health endpoint!")).toBe("add-a-health-endpoint");
  });

  it("reports branch and clean state, creates/checks out branches, commits", async () => {
    expect(await currentBranch(dir)).toBe("main");
    expect(await isClean(dir)).toBe(true);

    await createAndCheckout(dir, "telos/forge/x");
    expect(await currentBranch(dir)).toBe("telos/forge/x");

    writeFileSync(join(dir, "b.ts"), "export function g() { return 2; }\n");
    expect(await isClean(dir)).toBe(false);
    expect(await commitAll(dir, "add b")).toBe(true);
    expect(await isClean(dir)).toBe(true);
    expect(await commitAll(dir, "noop")).toBe(false); // nothing to commit

    await checkout(dir, "main");
    expect(await currentBranch(dir)).toBe("main");
  });
});

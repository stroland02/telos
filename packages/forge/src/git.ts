import { promisify } from "node:util";
import { execFile } from "node:child_process";

const run = promisify(execFile);

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

export async function currentBranch(cwd: string): Promise<string> {
  const { stdout } = await run("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd });
  return stdout.trim();
}

export async function isClean(cwd: string): Promise<boolean> {
  const { stdout } = await run("git", ["status", "--porcelain"], { cwd });
  return stdout.trim().length === 0;
}

export async function createAndCheckout(cwd: string, branch: string): Promise<void> {
  await run("git", ["checkout", "-b", branch], { cwd });
}

export async function checkout(cwd: string, branch: string): Promise<void> {
  await run("git", ["checkout", branch], { cwd });
}

export async function commitAll(cwd: string, message: string): Promise<boolean> {
  await run("git", ["add", "-A"], { cwd });
  if (await isClean(cwd)) return false;
  await run("git", ["commit", "-m", message], { cwd });
  return true;
}

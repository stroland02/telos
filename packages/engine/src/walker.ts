import { extname, join, relative } from "node:path";
import { readFile, stat } from "node:fs/promises";
import fg from "fast-glob";
import ignore from "ignore";
import { EXTENSION_LANGUAGE } from "./languages/registry.js";

export interface DiscoveredFile { path: string; language: string }

const ALWAYS_IGNORE = ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/build/**", "**/.telos/**"];
const MAX_BYTES = 1_000_000;

export function detectLanguage(filePath: string): string | null {
  return EXTENSION_LANGUAGE[extname(filePath).toLowerCase()] ?? null;
}

async function loadGitignore(root: string) {
  const ig = ignore();
  try { ig.add(await readFile(join(root, ".gitignore"), "utf8")); } catch { /* none */ }
  return ig;
}

export async function walk(root: string): Promise<DiscoveredFile[]> {
  const ig = await loadGitignore(root);
  const all = await fg("**/*", { cwd: root, absolute: true, dot: false, ignore: ALWAYS_IGNORE, onlyFiles: true });
  const out: DiscoveredFile[] = [];
  for (const abs of all) {
    const rel = relative(root, abs).replace(/\\/g, "/");
    if (ig.ignores(rel)) continue;
    const language = detectLanguage(abs);
    if (!language) continue;
    if ((await stat(abs)).size > MAX_BYTES) continue;
    out.push({ path: abs, language });
  }
  return out;
}

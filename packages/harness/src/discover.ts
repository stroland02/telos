import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { parseFrontmatter, deriveTriggers } from "./frontmatter.js";

export type DiscoveredKind = "agent" | "skill";

// One agent or skill discovered on disk, with description-derived routing material.
export interface DiscoveredCapability {
  id: string; // "ecc:architect", "superpowers:brainstorming"
  kind: DiscoveredKind;
  source: string; // "ecc" | "superpowers" | "headroom" | <pluginId>
  title: string;
  description: string;
  tools?: string[];
  triggers: string[];
}

export interface HarnessSourceInfo {
  source: string;
  title: string;
  state: "installed" | "available";
  version?: string;
  installPath?: string;
  counts: { agents: number; skills: number };
}

export interface HarnessRoster {
  capabilities: DiscoveredCapability[];
  sources: HarnessSourceInfo[];
  scannedAt: number;
}

// The three harnesses Telos curates by default. Any other installed plugin is
// still discovered (under its own pluginId as the source) — these just get a
// friendly title and always appear, even when not installed yet (e.g. Headroom).
export const KNOWN_HARNESSES: { source: string; pluginId: string; title: string }[] = [
  { source: "superpowers", pluginId: "superpowers", title: "Superpowers" },
  { source: "ecc", pluginId: "ecc", title: "ECC" },
  { source: "headroom", pluginId: "headroom", title: "Headroom" },
];

interface ManifestEntry { installPath?: string; version?: string; lastUpdated?: string }
interface Manifest { plugins?: Record<string, ManifestEntry[]> }

/** Scan the installed-plugins manifest into a roster. Never throws — a missing or
 *  malformed manifest yields an empty roster (plus the known-default placeholders). */
export function discoverHarnesses(opts: { pluginsDir?: string } = {}): HarnessRoster {
  const pluginsDir = opts.pluginsDir ?? join(homedir(), ".claude", "plugins");
  const capabilities: DiscoveredCapability[] = [];
  const sources: HarnessSourceInfo[] = [];
  const seen = new Set<string>();

  const manifest = readManifest(pluginsDir);
  for (const [key, entries] of Object.entries(manifest.plugins ?? {})) {
    const pluginId = key.split("@")[0];
    const known = KNOWN_HARNESSES.find((k) => k.pluginId === pluginId);
    const source = known?.source ?? pluginId;
    if (seen.has(source)) continue;
    const entry = pickLatest(entries);
    if (!entry?.installPath) continue;
    const installPath = resolveInstallPath(entry.installPath, pluginsDir);

    const agents = scanDir(join(installPath, "agents"), "agent", source);
    const skills = scanSkills(join(installPath, "skills"), source);
    capabilities.push(...agents, ...skills);
    sources.push({
      source,
      title: known?.title ?? pluginId,
      state: "installed",
      version: entry.version,
      installPath,
      counts: { agents: agents.length, skills: skills.length },
    });
    seen.add(source);
  }

  // Known defaults that aren't installed still appear, as "available".
  for (const k of KNOWN_HARNESSES) {
    if (seen.has(k.source)) continue;
    sources.push({ source: k.source, title: k.title, state: "available", counts: { agents: 0, skills: 0 } });
    seen.add(k.source);
  }

  return { capabilities, sources, scannedAt: Date.now() };
}

function readManifest(pluginsDir: string): Manifest {
  try {
    const path = join(pluginsDir, "installed_plugins.json");
    if (!existsSync(path)) return {};
    return JSON.parse(readFileSync(path, "utf8")) as Manifest;
  } catch {
    return {};
  }
}

function pickLatest(entries: ManifestEntry[]): ManifestEntry | undefined {
  if (!Array.isArray(entries) || entries.length === 0) return undefined;
  return [...entries].sort((a, b) => (a.lastUpdated ?? "").localeCompare(b.lastUpdated ?? "")).at(-1);
}

function resolveInstallPath(installPath: string, pluginsDir: string): string {
  // Fixtures use a "__SELF__/..." sentinel so the manifest can stay portable.
  const cleaned = installPath.replace(/^__SELF__[\\/]/, "");
  return cleaned !== installPath || !isAbsolute(cleaned) ? join(pluginsDir, cleaned) : cleaned;
}

function scanDir(dir: string, kind: DiscoveredKind, source: string): DiscoveredCapability[] {
  if (!existsSync(dir)) return [];
  const out: DiscoveredCapability[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".md")) continue;
    const cap = toCapability(readSafe(join(dir, name)), kind, source);
    if (cap) out.push(cap);
  }
  return out;
}

function scanSkills(dir: string, source: string): DiscoveredCapability[] {
  if (!existsSync(dir)) return [];
  const out: DiscoveredCapability[] = [];
  for (const slug of readdirSync(dir)) {
    const skillFile = join(dir, slug, "SKILL.md");
    if (!existsSync(skillFile)) continue;
    const cap = toCapability(readSafe(skillFile), "skill", source);
    if (cap) out.push(cap);
  }
  return out;
}

function toCapability(text: string, kind: DiscoveredKind, source: string): DiscoveredCapability | null {
  const fm = parseFrontmatter(text);
  if (!fm.name) return null;
  const description = fm.description ?? "";
  return {
    id: `${source}:${fm.name}`,
    kind,
    source,
    title: humanize(fm.name),
    description,
    tools: fm.tools,
    triggers: deriveTriggers(`${fm.name} ${description}`),
  };
}

function readSafe(path: string): string {
  try { return readFileSync(path, "utf8"); } catch { return ""; }
}

function humanize(name: string): string {
  return name.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

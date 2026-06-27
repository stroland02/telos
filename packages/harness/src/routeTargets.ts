/**
 * Build the list of routable targets (workflow templates + enabled capabilities)
 * and persist their embedding vectors. Target *text* is what the embedding model
 * encodes; the cache lets us embed targets once and re-embed only when their text
 * changes (content-hash keyed), so the per-prompt path only embeds the prompt.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { WORKFLOW_TEMPLATES } from "./workflows.js";
import type { HarnessRoster } from "./discover.js";

export type RouteTarget = { id: string; kind: "template" | "capability"; text: string };

export interface EmbeddingCache {
  hash: string;
  dim: number;
  vectors: Record<string, number[]>;
}

const CACHE_FILE = "route-embeddings.json";

/** Templates + the capabilities of enabled sources, each with the text to embed. */
export function collectRouteTargets(roster: HarnessRoster, enabledSources: string[]): RouteTarget[] {
  const targets: RouteTarget[] = WORKFLOW_TEMPLATES.map((t) => ({
    id: t.id,
    kind: "template" as const,
    text: [t.intent, ...t.triggers].join(" ").replace(/\s+/g, " ").trim(),
  }));
  for (const c of roster.capabilities) {
    if (!enabledSources.includes(c.source)) continue;
    targets.push({ id: c.id, kind: "capability", text: `${c.title} ${c.description}`.trim() });
  }
  return targets;
}

/** Stable content hash of the target set — changes whenever any id/text changes. */
export function targetsHash(targets: RouteTarget[]): string {
  const basis = targets.map((t) => [t.id, t.text]);
  return createHash("sha1").update(JSON.stringify(basis)).digest("hex");
}

export function readEmbeddingCache(telosDir: string): EmbeddingCache | null {
  const path = join(telosDir, CACHE_FILE);
  if (!existsSync(path)) return null;
  try {
    const c = JSON.parse(readFileSync(path, "utf8")) as EmbeddingCache;
    if (!c || typeof c.hash !== "string" || !c.vectors) return null;
    return c;
  } catch {
    return null;
  }
}

export function writeEmbeddingCache(telosDir: string, cache: EmbeddingCache): void {
  try {
    writeFileSync(join(telosDir, CACHE_FILE), JSON.stringify(cache));
  } catch {
    /* a cache write failure must never break routing */
  }
}

import { TelosNode } from "@telos/engine";
import { Capability, CapabilityMatch, matchesNode } from "./capability.js";

export function specificity(match: CapabilityMatch): number {
  return [match.layers, match.languages, match.pathIncludes, match.nameIncludes]
    .filter((c) => c !== undefined).length;
}

export function recommendFor(node: TelosNode, catalog: Capability[]): Capability[] {
  return catalog
    .filter((c) => matchesNode(node, c.match))
    .sort((a, b) => specificity(b.match) - specificity(a.match) || a.id.localeCompare(b.id));
}

export interface RankedCapability { capability: Capability; matchCount: number }

export function recommendForNodes(nodes: TelosNode[], catalog: Capability[]): RankedCapability[] {
  const counts = new Map<string, { capability: Capability; matchCount: number }>();
  for (const node of nodes) {
    for (const cap of recommendFor(node, catalog)) {
      const cur = counts.get(cap.id) ?? { capability: cap, matchCount: 0 };
      cur.matchCount += 1;
      counts.set(cap.id, cur);
    }
  }
  return [...counts.values()].sort(
    (a, b) => b.matchCount - a.matchCount || a.capability.id.localeCompare(b.capability.id),
  );
}

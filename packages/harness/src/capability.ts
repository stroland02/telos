import { Layer, TelosNode } from "@telos/engine";

export type CapabilitySource = "ecc" | "superpowers" | "headroom";
export type CapabilityKind = "agent" | "skill";

export interface CapabilityMatch {
  layers?: Layer[];
  languages?: string[];
  pathIncludes?: string[];
  nameIncludes?: string[];
}

export interface Capability {
  id: string;
  kind: CapabilityKind;
  source: CapabilitySource;
  title: string;
  match: CapabilityMatch;
}

const lc = (s: string) => s.toLowerCase();
const someIncludes = (haystack: string, needles: string[]) =>
  needles.some((n) => lc(haystack).includes(lc(n)));

export function matchesNode(node: TelosNode, match: CapabilityMatch): boolean {
  const criteria: boolean[] = [];
  if (match.layers) criteria.push(match.layers.includes(node.layer));
  if (match.languages) criteria.push(match.languages.map(lc).includes(lc(node.language)));
  if (match.pathIncludes) criteria.push(someIncludes(node.path, match.pathIncludes));
  if (match.nameIncludes) {
    criteria.push(someIncludes(node.name, match.nameIncludes) || someIncludes(node.qualifiedName, match.nameIncludes));
  }
  if (criteria.length === 0) return false; // empty match never matches everything
  return criteria.every(Boolean);
}

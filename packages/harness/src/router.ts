import { CapabilityKind, CapabilitySource } from "./capability.js";
import type { DiscoveredCapability, HarnessRoster } from "./discover.js";

/**
 * A capability the router can suggest from the *prompt* a developer writes
 * (authoring/assist mode), as opposed to from a code node's graph context.
 * Heuristic stage (Phase 1.5b): keyword/phrase triggers. A semantic-embedding
 * router replaces the matching in Phase 3 without changing this shape.
 */
export interface PromptCapability {
  id: string;
  kind: CapabilityKind;
  source: CapabilitySource;
  title: string;
  triggers: string[]; // case-insensitive substrings that signal this capability
}

export interface RoutedCapability { capability: PromptCapability; score: number }

/**
 * Rank prompt capabilities by how many of their triggers appear in the prompt.
 * Returns only positive matches, most-relevant first (ties broken by id).
 */
export function routePrompt(prompt: string, catalog: PromptCapability[]): RoutedCapability[] {
  const p = prompt.toLowerCase();
  return catalog
    .map((capability) => ({ capability, score: capability.triggers.filter((t) => p.includes(t.toLowerCase())).length }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.capability.id.localeCompare(b.capability.id));
}

/** Built-in prompt-intent catalog (process + cross-cutting capabilities). */
export const PROMPT_CATALOG: PromptCapability[] = [
  { id: "superpowers:brainstorming", kind: "skill", source: "superpowers", title: "Brainstorm the design first", triggers: ["build", "create", "new feature", "add a feature", "design a", "implement a"] },
  { id: "superpowers:writing-plans", kind: "skill", source: "superpowers", title: "Write an implementation plan", triggers: ["implementation plan", "write a plan", "break down", "break this into tasks"] },
  { id: "superpowers:systematic-debugging", kind: "skill", source: "superpowers", title: "Debug systematically", triggers: ["bug", "error", "failing", "crash", "stack trace", "not working", "broken", "regression"] },
  { id: "superpowers:test-driven-development", kind: "skill", source: "superpowers", title: "Test-driven development", triggers: ["tdd", "write tests", "test first", "failing test"] },
  { id: "ecc:security-review", kind: "skill", source: "ecc", title: "Security review", triggers: ["security", "auth", "vulnerab", "injection", "secret", "credential", "xss", "csrf"] },
  { id: "ecc:code-review", kind: "skill", source: "ecc", title: "Code review", triggers: ["review", "code review", "before merging", "pull request"] },
  { id: "ecc:performance-optimizer", kind: "agent", source: "ecc", title: "Optimize performance", triggers: ["optimize", "slow", "performance", "bottleneck", "speed up", "memory leak", "latency", "too slow"] },
  { id: "ecc:database-reviewer", kind: "agent", source: "ecc", title: "Database / SQL review", triggers: ["database", "sql", "query", "migration", "schema", "index", "n+1"] },
  { id: "ecc:a11y-architect", kind: "agent", source: "ecc", title: "Accessibility review", triggers: ["accessibility", "a11y", "wcag", "screen reader", "aria", "keyboard navigation"] },
  { id: "ecc:refactor-cleaner", kind: "agent", source: "ecc", title: "Refactor / remove dead code", triggers: ["refactor", "clean up", "dead code", "simplify", "duplicate code", "remove unused", "tidy up"] },
  { id: "ecc:architect", kind: "agent", source: "ecc", title: "Architecture & system design", triggers: ["architecture", "system design", "scalab", "design pattern", "high-level design"] },
  { id: "ecc:e2e-runner", kind: "agent", source: "ecc", title: "End-to-end testing", triggers: ["e2e", "end to end", "end-to-end", "playwright", "browser test"] },
  { id: "ecc:doc-updater", kind: "agent", source: "ecc", title: "Update documentation", triggers: ["documentation", "readme", "changelog", "update docs", "write docs"] },
  { id: "headroom:compress", kind: "skill", source: "headroom", title: "Compress context to cut tokens", triggers: ["too many tokens", "context too", "too long", "compress", "reduce cost", "token cost"] },
];

/**
 * One-line routing nudge for the UserPromptSubmit hook: which curated capability
 * fits this prompt, restricted to the currently-enabled harnesses. Returns "" when
 * nothing matches (so the hook injects nothing and never blocks the prompt).
 */
export function routeForHook(
  prompt: string,
  enabledSources: CapabilitySource[],
  catalog: PromptCapability[] = PROMPT_CATALOG,
  limit = 3,
): string {
  if (!prompt.trim() || enabledSources.length === 0) return "";
  const allowed = new Set(enabledSources);
  const routed = routePrompt(prompt, catalog.filter((c) => allowed.has(c.source))).slice(0, limit);
  if (routed.length === 0) return "";
  return `Telos: for this task, use ${routed.map((r) => r.capability.id).join(", ")}.`;
}

// ---------------------------------------------------------------------------
// Roster-based routing (H2): score the *live* discovered roster against the
// prompt and the product graph, instead of the small hand-typed PROMPT_CATALOG.
// ---------------------------------------------------------------------------

/** What the product actually is, derived from the Telos graph, used to bias routing. */
export interface ProductContext {
  languages: string[];
  layers: string[];
  changedFiles: string[];
}

export interface RoutedRosterCapability {
  capability: DiscoveredCapability;
  score: number;
}

const STOP = new Set(["the", "and", "for", "with", "that", "this", "you", "your", "are", "from", "into", "a", "to", "of", "in", "on", "it", "is", "be", "do", "my", "we"]);

function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) ?? []).filter((t) => !STOP.has(t));
}

/**
 * Deterministic relevance score for one capability against a prompt + product.
 *  +2 per trigger substring found in the prompt,
 *  +1 per term shared between the prompt and the capability's description/name,
 *  +3 when a product language/layer appears in the capability id or description.
 */
export function scoreCapability(prompt: string, cap: DiscoveredCapability, ctx?: ProductContext): number {
  const p = prompt.toLowerCase();
  let score = 0;
  for (const t of cap.triggers) if (p.includes(t)) score += 2;

  const promptTerms = new Set(tokens(prompt));
  const capTerms = new Set([...tokens(cap.description), ...tokens(cap.title), ...tokens(cap.id)]);
  for (const t of promptTerms) if (capTerms.has(t)) score += 1;

  if (ctx) {
    const hay = `${cap.id} ${cap.description}`.toLowerCase();
    for (const lang of ctx.languages) if (lang && hay.includes(lang.toLowerCase())) score += 3;
    for (const layer of ctx.layers) if (layer && hay.includes(layer.toLowerCase())) score += 3;
  }
  return score;
}

/**
 * Rank the live roster for a prompt, restricted to enabled sources. Returns only
 * positive matches, most-relevant first (ties broken by id). Empty enabledSources
 * or empty prompt → no matches.
 */
export function routeRoster(
  prompt: string,
  roster: HarnessRoster,
  enabledSources: string[],
  ctx?: ProductContext,
  limit = 3,
): RoutedRosterCapability[] {
  if (!prompt.trim() || enabledSources.length === 0) return [];
  const allowed = new Set(enabledSources);
  return roster.capabilities
    .filter((c) => allowed.has(c.source))
    .map((capability) => ({ capability, score: scoreCapability(prompt, capability, ctx) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.capability.id.localeCompare(b.capability.id))
    .slice(0, limit);
}

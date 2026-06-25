import { CapabilityKind, CapabilitySource } from "./capability.js";

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

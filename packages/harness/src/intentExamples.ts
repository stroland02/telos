/**
 * Curated example phrasings per workflow intent — the "training set" for the
 * tiny nearest-centroid router. Each template's centroid is the mean feature
 * vector of these examples; a prompt routes to the nearest centroid by cosine.
 * Adding a phrasing here teaches the router a new way to express an intent —
 * far more robust than the brittle substring triggers, and it generalizes via
 * char-trigram overlap to phrasings we did not list.
 *
 * Include real-world failing phrasings here so they route correctly.
 */
import { WORKFLOW_TEMPLATES } from "./workflows.js";
import { featurize, centroid } from "./textVector.js";
import type { SemTarget } from "./semantic.js";

export const TEMPLATE_EXAMPLES: Record<string, string[]> = {
  "feature-build": [
    "build a new dashboard feature for the order flow",
    "add a new payment endpoint to the api",
    "implement a search bar component",
    "create a settings page",
    "scaffold a new module for notifications",
    "add support for dark mode",
    "let's build a live activity feed",
  ],
  bugfix: [
    "fix the crash on login",
    "the app throws an error when saving",
    "this test is failing after my change",
    "debug why the page is broken",
    "there is a stack trace on startup",
    "a regression appeared after the last release",
  ],
  review: [
    "review this pull request",
    "do a code review before merging",
    "check this code for quality issues",
    "look over my changes",
    "is this code good to merge",
  ],
  perf: [
    "this database query is slow, optimize it",
    "reduce the request latency",
    "fix the memory leak",
    "speed up the page load time",
    "find the performance bottleneck",
  ],
  "context-heavy": [
    "compress the context",
    "there are too many tokens in the prompt",
    "reduce token usage for this conversation",
    "the context is too long",
  ],
  test: [
    "write unit tests for this module",
    "add integration tests",
    "implement all the SDLC tests including unit and system tests",
    "improve the test coverage",
    "write a full test suite",
    "design an acceptance and regression testing strategy",
    "tdd this feature",
  ],
  docs: [
    "update the readme",
    "write documentation for this module",
    "update the changelog",
    "document the public api",
  ],
};

let cache: { key: string; targets: SemTarget[] } | null = null;

/** One centroid SemTarget per template whose source is enabled. Memoized. */
export function intentCentroids(enabledSources: string[]): SemTarget[] {
  const key = [...enabledSources].sort().join(",");
  if (cache && cache.key === key) return cache.targets;
  const allowed = new Set(enabledSources);
  const targets: SemTarget[] = [];
  for (const tpl of WORKFLOW_TEMPLATES) {
    if (!tpl.sources.some((s) => allowed.has(s))) continue;
    const examples = TEMPLATE_EXAMPLES[tpl.id] ?? [];
    // Fold the template's own intent + triggers in alongside the examples.
    const texts = [...examples, [tpl.intent, ...tpl.triggers].join(" ")];
    targets.push({ id: tpl.id, vec: centroid(texts.map((t) => featurize(t))) });
  }
  cache = { key, targets };
  return targets;
}

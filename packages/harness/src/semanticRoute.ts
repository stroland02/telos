/**
 * Semantic intent routing — the in-process replacement for substring keyword
 * matching. Featurize the prompt, pick the nearest intent centroid by cosine,
 * and resolve that template into a concrete plan. Runs entirely in-process
 * (no model download, no server, offline), so it is cheap enough for the hook.
 *
 * Returns null when nothing clears the confidence threshold (or the chosen
 * template resolves to no agents), letting the caller fall back to keyword
 * routing — which itself stays silent on a no-match.
 */
import type { HarnessRoster } from "./discover.js";
import type { ProductContext } from "./router.js";
import { featurize } from "./textVector.js";
import { scoreSemantic } from "./semantic.js";
import { intentCentroids } from "./intentExamples.js";
import { WORKFLOW_TEMPLATES, planFromTemplate, type OrchestrationPlan } from "./workflows.js";

/**
 * Minimum cosine for a confident match in the hashed feature space. Tuned from
 * the score distribution: real intents land ≥ 0.41, off-topic/meta prompts ≤ 0.19,
 * so 0.30 cleanly separates them — below it we stay silent / fall back to keyword.
 */
export const SEMANTIC_MIN = 0.30;

/** The best-matching template id for a prompt, or null when none is confident. */
export function selectTemplateSemantic(
  prompt: string, enabledSources: string[], opts: { min?: number } = {},
): { id: string; score: number } | null {
  if (!prompt.trim()) return null;
  const centroids = intentCentroids(enabledSources);
  if (centroids.length === 0) return null;
  const scored = scoreSemantic(featurize(prompt), centroids, { min: opts.min ?? SEMANTIC_MIN, limit: 1 });
  return scored[0] ?? null;
}

export function semanticRoute(
  prompt: string,
  roster: HarnessRoster,
  enabledSources: string[],
  ctx?: ProductContext,
  opts: { min?: number } = {},
): OrchestrationPlan | null {
  const pick = selectTemplateSemantic(prompt, enabledSources, opts);
  if (!pick) return null;
  const tpl = WORKFLOW_TEMPLATES.find((t) => t.id === pick.id);
  if (!tpl) return null;
  return planFromTemplate(tpl, roster, enabledSources, ctx);
}

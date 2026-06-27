/**
 * Capability-level semantic routing (LLM phase slice 2). After slice 1 picks a
 * workflow template, this surfaces the most relevant *specific* agents from the
 * full discovered roster that the template did not already name — e.g. "make this
 * WCAG compliant" pulls in ecc:a11y-architect. Augment-only: it never overrides
 * the template and never resurrects a silent no-match.
 *
 * In-process and dependency-free: it reuses the slice-1 hashing featurizer, so
 * scoring the whole roster is a few milliseconds with no model and no cache file.
 */
import type { HarnessRoster } from "./discover.js";
import { featurize } from "./textVector.js";
import { scoreSemantic, type SemTarget } from "./semantic.js";
import type { OrchestrationPlan } from "./workflows.js";

/**
 * Minimum cosine for a capability to be surfaced as a specialist. Tuned from a
 * probe over the real 352-capability roster: genuine matches land 0.30–0.42
 * (rust-build-resolver 0.42, e2e-runner 0.38, security-scan 0.34), while
 * off-topic prompts top out ~0.21 — so 0.30 keeps real specialists and cuts noise.
 */
export const SPECIALIST_MIN = 0.30;

let memo: { key: string; targets: SemTarget[] } | null = null;

/** One feature vector per enabled capability. Memoized per roster version. */
export function capabilityVectors(roster: HarnessRoster, enabledSources: string[]): SemTarget[] {
  const key = roster.scannedAt + "|" + [...enabledSources].sort().join(",");
  if (memo && memo.key === key) return memo.targets;
  const allowed = new Set(enabledSources);
  const targets: SemTarget[] = [];
  for (const c of roster.capabilities) {
    if (!allowed.has(c.source)) continue;
    const text = [c.title, c.description, (c.triggers ?? []).join(" ")].join(" ");
    targets.push({ id: c.id, vec: featurize(text) });
  }
  memo = { key, targets };
  return targets;
}

/** Top-N roster capabilities most similar to the prompt, above the threshold. */
export function selectSpecialists(
  prompt: string,
  roster: HarnessRoster,
  enabledSources: string[],
  opts: { min?: number; limit?: number } = {},
): { id: string; score: number }[] {
  if (!prompt.trim()) return [];
  const vecs = capabilityVectors(roster, enabledSources);
  if (vecs.length === 0) return [];
  return scoreSemantic(featurize(prompt), vecs, { min: opts.min ?? SPECIALIST_MIN, limit: opts.limit ?? 3 });
}

/**
 * Append a deduped "specialists" step to a non-empty plan. An empty plan (no
 * agents) is returned unchanged so a silent no-match stays silent.
 */
export function augmentWithSpecialists(
  plan: OrchestrationPlan,
  prompt: string,
  roster: HarnessRoster,
  enabledSources: string[],
  opts: { min?: number; limit?: number } = {},
): OrchestrationPlan {
  const existing = new Set(plan.steps.flatMap((s) => s.agents.map((a) => a.id)));
  if (existing.size === 0) return plan;
  const picks = selectSpecialists(prompt, roster, enabledSources, opts).filter((p) => !existing.has(p.id));
  if (picks.length === 0) return plan;
  return {
    ...plan,
    steps: [
      ...plan.steps,
      {
        phase: "specialists",
        parallel: true,
        agents: picks.map((p) => ({ id: p.id, why: "top semantic match for this prompt" })),
      },
    ],
  };
}

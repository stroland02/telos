import type { OrchestrationPlan } from "./workflows.js";
import type { ProductContext } from "./router.js";

/**
 * Render an orchestration plan as the visible block the UserPromptSubmit hook
 * injects into the conversation. Returns "" when the plan has no agents, so the
 * hook stays silent (and never blocks the prompt) on a no-match.
 */
export function renderPlan(plan: OrchestrationPlan, product?: ProductContext): string {
  const agentCount = plan.steps.reduce((n, s) => n + s.agents.length, 0);
  if (agentCount === 0) return "";

  const prod = product && (product.languages.length || product.layers.length)
    ? ` · product: ${product.languages.join("/") || "?"} (${product.layers.join(",") || "?"})`
    : "";
  // A bordered banner so Telos reads as unmistakably ACTIVE on every prompt,
  // instead of a dim two-liner that blends into hook noise.
  const lines = [`╭─ ⟢ TELOS ACTIVE · ${plan.intent}${prod}`];

  // Lead handoff: when an ECC orchestration pipeline covers this intent (and is
  // installed + enabled), recommend it first, then offer the manual breakdown.
  if (plan.orchestrator) {
    lines.push(`│ ▶ Run [telos] ${plan.orchestrator.id}`);
    lines.push(`│   ${plan.orchestrator.pipeline}`);
    lines.push("│ — or dispatch manually —");
  }

  let n = 0;
  for (const step of plan.steps) {
    if (step.agents.length === 0) continue;
    n += 1;
    const tag = step.parallel && step.agents.length > 1 ? "⇉ parallel: " : "";
    const why = step.agents.length === 1 ? ` — ${step.agents[0].why}` : "";
    // `[telos] ` prefix marks each dispatched capability as Telos-routed, so its
    // origin is obvious when it runs as a subagent in the conversation.
    lines.push(`│ ${n}. ${tag}${step.agents.map((a) => `[telos] ${a.id}`).join(", ")}${why}`);
  }
  lines.push("╰─ → dispatch these as subagents.");
  return lines.join("\n");
}

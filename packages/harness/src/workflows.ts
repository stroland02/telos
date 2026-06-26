import type { DiscoveredCapability, HarnessRoster } from "./discover.js";
import { routeRoster, type ProductContext } from "./router.js";

// A role is an abstract slot in a workflow ("the language reviewer"); the planner
// resolves it to a concrete discovered capability using the product graph, so a
// TypeScript repo gets the TS reviewer and a Python repo gets the Python one.
export type WorkflowRole =
  | "designer"
  | "planner"
  | "tester"
  | "language-reviewer"
  | "security-reviewer"
  | "code-reviewer"
  | "debugger"
  | "perf"
  | "db-reviewer"
  | "compressor";

export interface WorkflowStep {
  phase: string;
  parallel: boolean;
  roles: WorkflowRole[];
}

export interface WorkflowTemplate {
  id: string;
  title: string;
  intent: string;
  sources: string[]; // harnesses this template draws on
  triggers: string[]; // prompt keywords that select it
  steps: WorkflowStep[];
}

export interface OrchestrationPlanStep {
  phase: string;
  parallel: boolean;
  agents: { id: string; why: string }[];
}

export interface OrchestrationPlan {
  intent: string;
  template: string | null;
  steps: OrchestrationPlanStep[];
  rationale: string;
}

// Signature pipelines mined from each harness's own process. Roles are resolved
// per-product at plan time; steps that resolve to nothing are dropped.
export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "feature-build",
    title: "Feature build",
    intent: "feature build",
    sources: ["superpowers", "ecc"],
    triggers: ["build", "create", "add a feature", "new feature", "implement", "feature"],
    steps: [
      { phase: "design", parallel: false, roles: ["designer"] },
      { phase: "plan", parallel: false, roles: ["planner"] },
      { phase: "test", parallel: false, roles: ["tester"] },
      { phase: "review", parallel: true, roles: ["language-reviewer", "security-reviewer", "code-reviewer"] },
    ],
  },
  {
    id: "bugfix",
    title: "Bug fix",
    intent: "bug fix",
    sources: ["superpowers", "ecc"],
    triggers: ["bug", "crash", "error", "failing", "broken", "not working", "regression", "stack trace"],
    steps: [
      { phase: "diagnose", parallel: false, roles: ["debugger"] },
      { phase: "fix-review", parallel: true, roles: ["language-reviewer"] },
      { phase: "test", parallel: false, roles: ["tester"] },
    ],
  },
  {
    id: "review",
    title: "Review",
    intent: "review",
    sources: ["ecc"],
    triggers: ["review", "pull request", "before merging", "code review"],
    steps: [
      { phase: "review", parallel: true, roles: ["language-reviewer", "security-reviewer", "code-reviewer"] },
    ],
  },
  {
    id: "perf",
    title: "Performance",
    intent: "performance",
    sources: ["ecc"],
    triggers: ["slow", "optimize", "performance", "bottleneck", "latency", "speed up", "memory leak"],
    steps: [
      { phase: "profile", parallel: false, roles: ["perf"] },
      { phase: "data", parallel: false, roles: ["db-reviewer"] },
    ],
  },
  {
    id: "context-heavy",
    title: "Context compression",
    intent: "context compression",
    sources: ["headroom"],
    triggers: ["too many tokens", "compress", "too long", "reduce cost", "context too"],
    steps: [{ phase: "compress", parallel: false, roles: ["compressor"] }],
  },
];

// Each role's preferred capability id(s). The language reviewer is resolved
// separately from the product's languages.
const ROLE_PREFERENCES: Record<Exclude<WorkflowRole, "language-reviewer">, string[]> = {
  designer: ["superpowers:brainstorming"],
  planner: ["superpowers:writing-plans"],
  tester: ["superpowers:test-driven-development", "ecc:tdd-guide"],
  "security-reviewer": ["ecc:security-reviewer"],
  "code-reviewer": ["ecc:code-reviewer"],
  debugger: ["superpowers:systematic-debugging"],
  perf: ["ecc:performance-optimizer"],
  "db-reviewer": ["ecc:database-reviewer"],
  compressor: ["headroom:compress"],
};

function languageReviewerId(ctx?: ProductContext): string[] {
  const langs = (ctx?.languages ?? []).map((l) => l.toLowerCase());
  const ids: string[] = [];
  if (langs.some((l) => l.includes("tsx")) || (ctx?.changedFiles ?? []).some((f) => f.endsWith(".tsx"))) ids.push("ecc:react-reviewer");
  if (langs.includes("typescript") || langs.includes("javascript")) ids.push("ecc:typescript-reviewer");
  if (langs.includes("python")) ids.push("ecc:python-reviewer");
  if (langs.includes("go")) ids.push("ecc:go-reviewer");
  if (langs.includes("rust")) ids.push("ecc:rust-reviewer");
  ids.push("ecc:code-reviewer"); // always a safe fallback
  return ids;
}

/** Resolve a role to a concrete capability present in the roster and enabled. */
export function resolveRole(
  role: WorkflowRole,
  roster: HarnessRoster,
  enabledSources: string[],
  ctx?: ProductContext,
): DiscoveredCapability | null {
  const allowed = new Set(enabledSources);
  const prefs = role === "language-reviewer" ? languageReviewerId(ctx) : ROLE_PREFERENCES[role];
  for (const id of prefs) {
    const found = roster.capabilities.find((c) => c.id === id && allowed.has(c.source));
    if (found) return found;
  }
  return null;
}

function selectTemplate(prompt: string, enabledSources: string[]): WorkflowTemplate | null {
  const p = prompt.toLowerCase();
  const allowed = new Set(enabledSources);
  let best: { tpl: WorkflowTemplate; score: number } | null = null;
  for (const tpl of WORKFLOW_TEMPLATES) {
    if (!tpl.sources.some((s) => allowed.has(s))) continue;
    const score = tpl.triggers.filter((t) => p.includes(t)).length;
    if (score > 0 && (!best || score > best.score)) best = { tpl, score };
  }
  return best?.tpl ?? null;
}

function whyFor(role: WorkflowRole): string {
  const reasons: Record<WorkflowRole, string> = {
    designer: "design before code",
    planner: "break the work into a plan",
    tester: "tests first",
    "language-reviewer": "language-specific review",
    "security-reviewer": "security review",
    "code-reviewer": "final gate",
    debugger: "find the root cause",
    perf: "profile the hot path",
    "db-reviewer": "check the data layer",
    compressor: "cut context tokens",
  };
  return reasons[role];
}

/**
 * Plan a multi-agent workflow for a prompt. Picks the best-matching template among
 * enabled harnesses and resolves each role to a concrete agent using the product
 * graph; when nothing matches, falls back to flat top-N roster routing.
 */
export function planWorkflow(
  prompt: string,
  roster: HarnessRoster,
  enabledSources: string[],
  ctx?: ProductContext,
): OrchestrationPlan {
  const tpl = selectTemplate(prompt, enabledSources);
  if (tpl) {
    const steps: OrchestrationPlanStep[] = [];
    for (const step of tpl.steps) {
      const agents = step.roles
        .map((role) => ({ role, cap: resolveRole(role, roster, enabledSources, ctx) }))
        .filter((r): r is { role: WorkflowRole; cap: DiscoveredCapability } => r.cap !== null)
        .map(({ role, cap }) => ({ id: cap.id, why: whyFor(role) }));
      if (agents.length > 0) steps.push({ phase: step.phase, parallel: step.parallel, agents });
    }
    if (steps.length > 0) {
      const prod = ctx && (ctx.languages.length || ctx.layers.length)
        ? ` on a ${ctx.languages.join("/") || "?"} product`
        : "";
      return { intent: tpl.intent, template: tpl.id, steps, rationale: `${tpl.title}${prod}` };
    }
  }

  // Fallback: flat assist routing.
  const routed = routeRoster(prompt, roster, enabledSources, ctx, 3);
  if (routed.length === 0) {
    return { intent: "assist", template: null, steps: [], rationale: "no matching capabilities" };
  }
  return {
    intent: "assist",
    template: null,
    steps: [{ phase: "assist", parallel: true, agents: routed.map((r) => ({ id: r.capability.id, why: "relevant to this prompt" })) }],
    rationale: "best-matching capabilities for this prompt",
  };
}

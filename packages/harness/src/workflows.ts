import type { DiscoveredCapability, HarnessRoster } from "./discover.js";
import { routePrompt, PROMPT_CATALOG, type ProductContext } from "./router.js";

// A role is an abstract slot in a workflow ("the language reviewer"); the planner
// resolves it to a concrete discovered capability using the product graph, so a
// TypeScript repo gets the TS reviewer and a Python repo gets the Python one.
export type WorkflowRole =
  | "designer"
  | "planner"
  | "tester"
  | "language-reviewer"
  | "build-resolver"
  | "security-reviewer"
  | "code-reviewer"
  | "debugger"
  | "perf"
  | "db-reviewer"
  | "compressor"
  | "doc";

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
    // Require a concrete "build/add/implement a THING" phrasing. Trailing spaces
    // make the short-word triggers collision-safe: "implement a " does NOT match
    // "implement all" / "implement authentication"; bare "build"/"feature" are out.
    triggers: ["build a ", "build an ", "create a ", "create an ", "add a new ", "new feature", "add a feature", "implement a ", "implement support", "add support for", "scaffold a ", "let's build a", "let me build a"],
    steps: [
      { phase: "design", parallel: false, roles: ["designer"] },
      { phase: "plan", parallel: false, roles: ["planner"] },
      { phase: "test", parallel: false, roles: ["tester"] },
      { phase: "review", parallel: true, roles: ["language-reviewer", "security-reviewer", "code-reviewer"] },
    ],
  },
  {
    // Placed BEFORE bugfix: a build/compile failure routes to the language's
    // build-resolver (ECC ships one per stack), not the generic debugger. Triggers
    // are specific multi-word phrases so a plain "error" still goes to bugfix.
    id: "build-fix",
    title: "Build fix",
    intent: "build fix",
    sources: ["ecc"],
    triggers: ["build fail", "build error", "build is broken", "build broke", "won't compile", "wont compile", "compile error", "compilation error", "compiler error", "type error", "tsc error", "cargo build", "gradle build", "cannot find module", "module not found"],
    steps: [
      { phase: "build-fix", parallel: false, roles: ["build-resolver"] },
      { phase: "review", parallel: true, roles: ["language-reviewer"] },
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
    sources: ["headroom", "ecc"],
    triggers: ["too many tokens", "compress the context", "reduce token", "context too long"],
    steps: [{ phase: "compress", parallel: false, roles: ["compressor"] }],
  },
  {
    id: "test",
    title: "Testing",
    intent: "testing",
    sources: ["superpowers", "ecc"],
    triggers: ["write tests", "write unit tests", "add tests", "test coverage", "unit test", "tdd", "test suite", "testing strateg", "test strateg", "acceptance test", "integration test", "system test", "regression test", "quality assurance"],
    steps: [{ phase: "test", parallel: false, roles: ["tester"] }],
  },
  {
    id: "docs",
    title: "Documentation",
    intent: "documentation",
    sources: ["ecc"],
    triggers: ["update the readme", "update docs", "write docs", "documentation", "changelog", "readme"],
    steps: [{ phase: "docs", parallel: false, roles: ["doc"] }],
  },
];

// Each role's preferred capability id(s). Language-aware roles (language-reviewer,
// build-resolver, tester) are resolved from the product's languages instead.
// Compressor prefers headroom, but falls back to ECC's context skills so the
// context-heavy template still resolves when headroom isn't installed.
type StaticRole = Exclude<WorkflowRole, "language-reviewer" | "build-resolver" | "tester">;
const ROLE_PREFERENCES: Record<StaticRole, string[]> = {
  designer: ["superpowers:brainstorming"],
  planner: ["superpowers:writing-plans"],
  "security-reviewer": ["ecc:security-reviewer"],
  "code-reviewer": ["ecc:code-reviewer"],
  debugger: ["superpowers:systematic-debugging"],
  perf: ["ecc:performance-optimizer"],
  "db-reviewer": ["ecc:database-reviewer"],
  compressor: ["headroom:compress", "ecc:strategic-compact", "ecc:context-budget", "ecc:token-budget-advisor"],
  doc: ["ecc:doc-updater"],
};

function hasTsx(ctx?: ProductContext): boolean {
  const langs = (ctx?.languages ?? []).map((l) => l.toLowerCase());
  return langs.some((l) => l.includes("tsx")) || (ctx?.changedFiles ?? []).some((f) => f.endsWith(".tsx"));
}

function languageReviewerId(ctx?: ProductContext): string[] {
  const langs = (ctx?.languages ?? []).map((l) => l.toLowerCase());
  const ids: string[] = [];
  if (hasTsx(ctx)) ids.push("ecc:react-reviewer");
  if (langs.includes("typescript") || langs.includes("javascript")) ids.push("ecc:typescript-reviewer");
  if (langs.includes("python")) ids.push("ecc:python-reviewer");
  if (langs.includes("go")) ids.push("ecc:go-reviewer");
  if (langs.includes("rust")) ids.push("ecc:rust-reviewer");
  ids.push("ecc:code-reviewer"); // always a safe fallback
  return ids;
}

// The stack-specific build/compile error fixer, falling back to ECC's generic
// build-error-resolver so any product gets *a* resolver.
function buildResolverId(ctx?: ProductContext): string[] {
  const langs = (ctx?.languages ?? []).map((l) => l.toLowerCase());
  const ids: string[] = [];
  if (hasTsx(ctx)) ids.push("ecc:react-build-resolver");
  if (langs.includes("go")) ids.push("ecc:go-build-resolver");
  if (langs.includes("rust")) ids.push("ecc:rust-build-resolver");
  ids.push("ecc:build-error-resolver"); // generic TS/JS/Python + universal fallback
  return ids;
}

// Prefer the language's test skill (behavior/coverage-aware) before the generic
// TDD discipline, so a React/Go/Rust repo gets its own test workflow.
function testerId(ctx?: ProductContext): string[] {
  const langs = (ctx?.languages ?? []).map((l) => l.toLowerCase());
  const ids: string[] = [];
  if (hasTsx(ctx)) ids.push("ecc:react-test");
  if (langs.includes("go")) ids.push("ecc:go-test");
  if (langs.includes("rust")) ids.push("ecc:rust-test");
  ids.push("superpowers:test-driven-development", "ecc:tdd-guide"); // generic fallback
  return ids;
}

function preferencesFor(role: WorkflowRole, ctx?: ProductContext): string[] {
  if (role === "language-reviewer") return languageReviewerId(ctx);
  if (role === "build-resolver") return buildResolverId(ctx);
  if (role === "tester") return testerId(ctx);
  return ROLE_PREFERENCES[role];
}

/** Resolve a role to a concrete capability present in the roster and enabled. */
export function resolveRole(
  role: WorkflowRole,
  roster: HarnessRoster,
  enabledSources: string[],
  ctx?: ProductContext,
): DiscoveredCapability | null {
  const allowed = new Set(enabledSources);
  for (const id of preferencesFor(role, ctx)) {
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
    "build-resolver": "fix the build/compile errors",
    "security-reviewer": "security review",
    "code-reviewer": "final gate",
    debugger: "find the root cause",
    perf: "profile the hot path",
    "db-reviewer": "check the data layer",
    compressor: "cut context tokens",
    doc: "update the docs",
  };
  return reasons[role];
}

/**
 * Plan a multi-agent workflow for a prompt. Picks the best-matching template among
 * enabled harnesses and resolves each role to a concrete agent using the product
 * graph; when nothing matches, falls back to flat top-N roster routing.
 */
/**
 * Build a concrete plan for a CHOSEN template by resolving each role to an agent
 * present in the roster. Returns null when no role resolves (every step empty),
 * so callers can fall through. Shared by keyword selection (planWorkflow) and
 * semantic selection (the server's planRoute).
 */
export function planFromTemplate(
  tpl: WorkflowTemplate,
  roster: HarnessRoster,
  enabledSources: string[],
  ctx?: ProductContext,
): OrchestrationPlan | null {
  const steps: OrchestrationPlanStep[] = [];
  for (const step of tpl.steps) {
    const agents = step.roles
      .map((role) => ({ role, cap: resolveRole(role, roster, enabledSources, ctx) }))
      .filter((r): r is { role: WorkflowRole; cap: DiscoveredCapability } => r.cap !== null)
      .map(({ role, cap }) => ({ id: cap.id, why: whyFor(role) }));
    if (agents.length > 0) steps.push({ phase: step.phase, parallel: step.parallel, agents });
  }
  if (steps.length === 0) return null;
  const prod = ctx && (ctx.languages.length || ctx.layers.length)
    ? ` on a ${ctx.languages.join("/") || "?"} product`
    : "";
  return { intent: tpl.intent, template: tpl.id, steps, rationale: `${tpl.title}${prod}` };
}

export function planWorkflow(
  prompt: string,
  roster: HarnessRoster,
  enabledSources: string[],
  ctx?: ProductContext,
): OrchestrationPlan {
  const tpl = selectTemplate(prompt, enabledSources);
  if (tpl) {
    const plan = planFromTemplate(tpl, roster, enabledSources, ctx);
    if (plan) return plan;
  }

  // Fallback: route over the CURATED prompt catalog (14 vetted intents), NOT the
  // full 352-capability roster — scoring all of them by description overlap surfaces
  // noise (e.g. "ecc:gget" for "how do I run the dev server?"). When nothing in the
  // curated set matches, return an empty plan so the hook injects NOTHING — silence
  // beats a wrong, token-wasting suggestion on questions/explanations.
  const allowed = new Set(enabledSources);
  const curated = routePrompt(prompt, PROMPT_CATALOG.filter((c) => allowed.has(c.source))).slice(0, 3);
  if (curated.length === 0) {
    return { intent: "assist", template: null, steps: [], rationale: "no confident match — staying silent" };
  }
  return {
    intent: "assist",
    template: null,
    steps: [{ phase: "assist", parallel: true, agents: curated.map((r) => ({ id: r.capability.id, why: "relevant to this prompt" })) }],
    rationale: "curated capabilities for this prompt",
  };
}

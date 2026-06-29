/**
 * Phase 3 regression battery — the quality gate for full-roster routing.
 *
 * `selectSpecialists` scores the ENTIRE discovered roster (hundreds of agents)
 * against the prompt and injects only matches above a confidence threshold. This
 * battery locks down that gate so the full pool stays *reachable* without the
 * junk-match/token-waste that got the old all-352 routing reverted:
 *   - genuine domain prompts pull the right specialist and clear the gate,
 *   - off-topic / generic prompts inject nothing,
 *   - the threshold is monotonic + tunable (raising it only ever suppresses),
 *   - the limit caps how many specialists a single prompt can inject.
 *
 * Modeled on the real roster's vocabulary (see capabilityRouting.ts SPECIALIST_MIN
 * probe). Sibling in spirit to workflows.test.ts's routing regression suite.
 */
import { describe, it, expect } from "vitest";
import { selectSpecialists, SPECIALIST_MIN } from "./capabilityRouting.js";
import type { HarnessRoster } from "./discover.js";

// A multi-domain slice of the real installed roster — enough distinct domains
// that a domain prompt has one obvious winner and many obvious non-matches.
const roster = {
  capabilities: [
    { id: "ecc:a11y-architect", kind: "agent", source: "ecc", title: "Accessibility architect", description: "WCAG accessibility screen reader aria keyboard navigation contrast inclusive UI compliance", triggers: ["accessibility", "wcag", "aria"] },
    { id: "ecc:security-reviewer", kind: "agent", source: "ecc", title: "Security reviewer", description: "finds vulnerabilities sql injection xss csrf owasp auth secrets credential leak unsafe crypto", triggers: ["security", "vulnerability", "auth"] },
    { id: "ecc:rust-reviewer", kind: "agent", source: "ecc", title: "Rust reviewer", description: "ownership borrow checker lifetimes unsafe idiomatic rust memory safety cargo", triggers: ["rust"] },
    { id: "ecc:python-reviewer", kind: "agent", source: "ecc", title: "Python reviewer", description: "pep8 pythonic idioms type hints security performance python code review", triggers: ["python"] },
    { id: "ecc:go-reviewer", kind: "agent", source: "ecc", title: "Go reviewer", description: "idiomatic go concurrency goroutines channels error handling performance", triggers: ["go", "golang"] },
    { id: "ecc:react-reviewer", kind: "agent", source: "ecc", title: "React reviewer", description: "react hooks render performance server client components jsx tsx accessibility", triggers: ["react", "jsx", "hook"] },
    { id: "ecc:database-reviewer", kind: "agent", source: "ecc", title: "Database reviewer", description: "postgres query optimization schema design index migration n+1 sql performance", triggers: ["database", "sql", "query"] },
    { id: "ecc:performance-optimizer", kind: "agent", source: "ecc", title: "Performance optimizer", description: "profiling bottleneck memory leak bundle size render optimization latency throughput", triggers: ["performance", "optimize", "slow"] },
    { id: "ecc:e2e-runner", kind: "agent", source: "ecc", title: "End to end testing", description: "playwright browser end to end e2e test journeys screenshots flaky quarantine", triggers: ["e2e", "playwright"] },
    { id: "ecc:doc-updater", kind: "agent", source: "ecc", title: "Doc updater", description: "update readme changelog documentation codemaps guides api docs", triggers: ["docs", "documentation"] },
    { id: "ecc:refactor-cleaner", kind: "agent", source: "ecc", title: "Refactor cleaner", description: "dead code removal duplicate consolidation knip depcheck ts-prune simplify tidy", triggers: ["refactor", "dead code"] },
    { id: "ecc:rust-build-resolver", kind: "agent", source: "ecc", title: "Rust build resolver", description: "cargo build errors borrow checker compile failures dependency cargo.toml fixes", triggers: ["rust build", "cargo"] },
  ],
  sources: [],
  scannedAt: 1,
} as unknown as HarnessRoster;

const ALL = ["ecc"];

// (prompt, expected top-matching specialist id). Each prompt is written in the
// natural language a developer would type — no exact id mentions.
const HITS: [string, string][] = [
  ["make this component WCAG accessible with aria labels and screen reader support", "ecc:a11y-architect"],
  ["audit the login flow for sql injection and other security vulnerabilities", "ecc:security-reviewer"],
  ["review my rust code for ownership and borrow checker and lifetime issues", "ecc:rust-reviewer"],
  ["check this python module for pep8 and pythonic idioms and type hints", "ecc:python-reviewer"],
  ["review the goroutine concurrency and channel error handling in this go service", "ecc:go-reviewer"],
  ["optimize the react hooks and render performance of these jsx components", "ecc:react-reviewer"],
  ["the postgres query is slow, look at the schema index and the n+1 problem", "ecc:database-reviewer"],
  ["profile the bottleneck, there is a memory leak and the bundle size is huge", "ecc:performance-optimizer"],
  ["write a playwright end to end browser test for the checkout journey", "ecc:e2e-runner"],
  ["update the readme and changelog and api documentation", "ecc:doc-updater"],
  ["remove the dead code and consolidate these duplicate helpers", "ecc:refactor-cleaner"],
];

// Prompts with no clear domain — the gate must inject nothing.
const MISSES: string[] = [
  "what is the weather today",
  "schedule a meeting for next tuesday afternoon",
  "tell me a joke about cats",
  "summarize the quarterly sales numbers",
  "",
  "   ",
];

describe("Phase 3 — full-roster quality gate (regression battery)", () => {
  describe("genuine domain prompts clear the gate with the right specialist on top", () => {
    for (const [prompt, expected] of HITS) {
      it(`routes "${prompt.slice(0, 48)}…" → ${expected}`, () => {
        const picks = selectSpecialists(prompt, roster, ALL);
        expect(picks.length).toBeGreaterThan(0);
        expect(picks[0].id).toBe(expected);
        expect(picks[0].score).toBeGreaterThanOrEqual(SPECIALIST_MIN);
      });
    }
  });

  describe("off-topic / generic prompts inject nothing (no junk matches)", () => {
    for (const prompt of MISSES) {
      it(`stays silent on "${prompt.trim().slice(0, 40) || "(blank)"}"`, () => {
        expect(selectSpecialists(prompt, roster, ALL)).toEqual([]);
      });
    }
  });

  describe("every injected pick — across all hit prompts — clears the threshold", () => {
    it("never surfaces a sub-threshold capability", () => {
      for (const [prompt] of HITS) {
        for (const pick of selectSpecialists(prompt, roster, ALL, { limit: 12 })) {
          expect(pick.score).toBeGreaterThanOrEqual(SPECIALIST_MIN);
        }
      }
    });
  });

  describe("the threshold is tunable + monotonic", () => {
    const prompt = "review my rust code for ownership and borrow checker and lifetime issues";

    it("a stricter min only ever removes picks (subset), never adds", () => {
      const ids = (min: number) => new Set(selectSpecialists(prompt, roster, ALL, { min, limit: 12 }).map((p) => p.id));
      const loose = ids(0.1);
      const strict = ids(0.5);
      expect(loose.size).toBeGreaterThan(0);
      for (const id of strict) expect(loose.has(id)).toBe(true); // strict ⊆ loose
      expect(strict.size).toBeLessThanOrEqual(loose.size);
    });

    it("min = 1.0 is an effectively closed gate (nothing clears it)", () => {
      expect(selectSpecialists(prompt, roster, ALL, { min: 1.0 })).toEqual([]);
    });

    it("min = 0 admits at least as many as the default gate", () => {
      const wide = selectSpecialists(prompt, roster, ALL, { min: 0, limit: 12 }).length;
      const def = selectSpecialists(prompt, roster, ALL, { limit: 12 }).length;
      expect(wide).toBeGreaterThanOrEqual(def);
    });
  });

  describe("the limit caps how many specialists a single prompt injects", () => {
    // A deliberately broad prompt that brushes several domains at once.
    const broad = "review this rust and python and go code for security and performance and accessibility";

    it("respects an explicit limit", () => {
      expect(selectSpecialists(broad, roster, ALL, { limit: 2, min: 0.1 }).length).toBeLessThanOrEqual(2);
    });

    it("defaults to at most 3 specialists", () => {
      expect(selectSpecialists(broad, roster, ALL).length).toBeLessThanOrEqual(3);
    });

    it("returns picks in descending score order", () => {
      const picks = selectSpecialists(broad, roster, ALL, { limit: 12, min: 0.05 });
      for (let i = 1; i < picks.length; i++) expect(picks[i - 1].score).toBeGreaterThanOrEqual(picks[i].score);
    });
  });
});

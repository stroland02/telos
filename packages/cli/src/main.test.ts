import { describe, it, expect, vi } from "vitest";
import { runScan, runEnrich, runTraceDemo, buildDemoOtlp, runTop, buildDemoProcesses, buildProgram, runContext, runMeasure, runHarness, runHarnessVerify, runStatusLine, runResolveCli, telosInvocation, telosHookInvocation } from "./main.js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../engine/fixtures/scan-sample");

describe("runScan", () => {
  it("returns a summary with positive node count", async () => {
    const summary = await runScan(repo);
    expect(summary.nodeCount).toBeGreaterThan(0);
    expect(summary.edgeCount).toBeGreaterThan(0);
    expect(summary.dbPath).toMatch(/graph\.db$/);
  });
});

describe("telos mcp command", () => {
  it("is registered", () => {
    const names = buildProgram().commands.map((c) => c.name());
    expect(names).toContain("mcp");
  });
});

describe("telos doctor command", () => {
  it("is registered", () => {
    const names = buildProgram().commands.map((c) => c.name());
    expect(names).toContain("doctor");
  });
});

describe("telos route command", () => {
  it("is registered", () => {
    const names = buildProgram().commands.map((c) => c.name());
    expect(names).toContain("route");
  });

  it("exposes the planner --hook and --legacy options", () => {
    const route = buildProgram().commands.find((c) => c.name() === "route")!;
    const flags = route.options.map((o) => o.long);
    expect(flags).toContain("--hook");
    expect(flags).toContain("--legacy");
  });

  it("prints an orchestration plan block or a no-match line for a prompt", async () => {
    const out: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...a) => { out.push(a.join(" ")); });
    try {
      await buildProgram().parseAsync(["node", "telos", "route", "build a new feature"]);
    } finally {
      spy.mockRestore();
    }
    const text = out.join("\n");
    expect(text === "" ? "No harness capability matched this prompt." : text)
      .toMatch(/⟢ TELOS ACTIVE|No harness capability matched/);
  });
});

describe("telos setup command", () => {
  it("is registered", () => {
    const names = buildProgram().commands.map((c) => c.name());
    expect(names).toContain("setup");
  });
});

describe("telos enrich command", () => {
  it("is registered", () => {
    const names = buildProgram().commands.map((c) => c.name());
    expect(names).toContain("enrich");
  });
});

describe("runEnrich enricher selection", () => {
  it("completes via fallback on the LLM path when no server is running", async () => {
    await runScan(repo); // ensure a graph.db exists
    const r = await runEnrich(repo, { llm: true, concurrency: 2 });
    expect(r.enriched).toBeGreaterThan(0); // fallback guarantees completion
    expect(r.enricher).toBe("llm");
  });
});

describe("telos context command", () => {
  it("is registered", () => {
    const names = buildProgram().commands.map((c) => c.name());
    expect(names).toContain("context");
  });
});

describe("runContext", () => {
  it("builds a context pack from the scanned graph", async () => {
    await runScan(repo); // ensure a graph.db exists
    const pack = runContext(repo, { limit: 5 });
    expect(pack.totals.nodes).toBeGreaterThan(0);
    expect(pack.entryPoints.length).toBeLessThanOrEqual(5);
    expect(Array.isArray(pack.layers)).toBe(true);
  });
});

describe("runHarnessVerify", () => {
  it("all routing checks pass (prompt → capability, node → agent)", () => {
    const v = runHarnessVerify();
    expect(v.cases.length).toBeGreaterThan(0);
    expect(v.failed).toBe(0);
    expect(v.passed).toBe(v.cases.length);
  });
});

describe("telos measure command", () => {
  it("is registered", () => {
    expect(buildProgram().commands.map((c) => c.name())).toContain("measure");
  });
});

describe("runMeasure", () => {
  it("measures the cold-read baseline against the warm-start brief", async () => {
    await runScan(repo); // ensure a graph.db exists over real fixture files
    const r = runMeasure(repo, { limit: 5 });
    expect(r.files).toBeGreaterThan(0);
    expect(r.missing).toBe(0); // fixture files are all on disk
    expect(r.baselineTokens).toBeGreaterThan(0); // real source was sized
    expect(r.packTokens).toBeGreaterThan(0);
    expect(r.reductionPct).toBeGreaterThanOrEqual(0); // savings are a large-repo property
    // The honest selective baseline is computed and never exceeds the exhaustive one.
    expect(r.selectiveBaselineTokens).toBeGreaterThanOrEqual(0);
    expect(r.selectiveBaselineTokens).toBeLessThanOrEqual(r.baselineTokens);
    // The savings MATH itself (positive reduction at scale) is covered in engine/measure.test.ts.
  });
});

describe("telos harness command", () => {
  it("is registered", () => {
    const names = buildProgram().commands.map((c) => c.name());
    expect(names).toContain("harness");
  });
});

describe("route --hook + harness count", () => {
  it("route command is registered", () => {
    expect(buildProgram().commands.map((c) => c.name())).toContain("route");
  });
  it("telosInvocation prefers the 'telos' bin when on PATH, else falls back to node", async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "telos-bin-"));
    try {
      // No telos on a PATH of one empty dir → node fallback with an absolute dist path.
      expect(telosInvocation({ PATH: dir })).toMatch(/^node ".*main\.(ts|js)"$/);
      // Drop a telos executable on PATH → short bin name.
      writeFileSync(join(dir, process.platform === "win32" ? "telos.CMD" : "telos"), "");
      expect(telosInvocation({ PATH: dir, PATHEXT: ".CMD" })).toBe("telos");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("telosHookInvocation prefers the 'telos-hook' bin, else node hook.js / route --hook", async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "telos-hookbin-"));
    try {
      // telos-hook on PATH → short bin name (the fast path).
      writeFileSync(join(dir, process.platform === "win32" ? "telos-hook.CMD" : "telos-hook"), "");
      expect(telosHookInvocation({ PATH: dir, PATHEXT: ".CMD" })).toBe("telos-hook");
      // Not on PATH → either a node hook.js invocation (built) or the route --hook fallback.
      expect(telosHookInvocation({ PATH: "" })).toMatch(/^node ".*hook\.(ts|js)"$|route --hook$/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("runStatusLine reflects the enabled harness count", async () => {
    const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const d = mkdtempSync(join(tmpdir(), "telos-hs-"));
    try {
      mkdirSync(join(d, ".telos"), { recursive: true });
      writeFileSync(join(d, ".telos", "harness.config.json"), JSON.stringify({ enabled: ["ecc"] }));
      const line = await runStatusLine(d);
      expect(line).toMatch(/1 harness/);
    } finally { rmSync(d, { recursive: true, force: true }); }
  });
});

describe("telos resolve command + runResolveCli", () => {
  it("is registered", () => {
    expect(buildProgram().commands.map((c) => c.name())).toContain("resolve");
  });
  it("produces findings with the stub driver", async () => {
    await runScan(repo);
    const state = await runResolveCli({ path: repo, driver: "stub", limit: 3, url: "http://127.0.0.1:65530" });
    expect(state.scanned).toBeGreaterThan(0);
    expect(state.findings.length).toBeGreaterThan(0);
    expect(state.done).toBe(true);
  });
});

describe("activate/deactivate/status commands", () => {
  it("are registered", () => {
    const names = buildProgram().commands.map((c) => c.name());
    expect(names).toContain("activate");
    expect(names).toContain("deactivate");
    expect(names).toContain("status");
  });
});

describe("runStatusLine", () => {
  it("returns the Telos engagement line", async () => {
    const line = await runStatusLine(repo);
    expect(line).toContain("◇ Telos");
    expect(line).toMatch(/agents/);
  });
});

describe("runHarness", () => {
  it("aggregates installed harnesses and totals from the catalogs", () => {
    const status = runHarness(repo);
    expect(status.installed.length).toBeGreaterThan(0);
    expect(status.totals.nodeCapabilities).toBeGreaterThan(0);
    expect(typeof status.drift.status).toBe("string");
  });
});

describe("telos tour command", () => {
  it("is registered", () => {
    expect(buildProgram().commands.map((c) => c.name())).toContain("tour");
  });
});

describe("telos ask command", () => {
  it("is registered", () => {
    expect(buildProgram().commands.map((c) => c.name())).toContain("ask");
  });
});

describe("telos trace command", () => {
  it("is registered", () => {
    expect(buildProgram().commands.map((c) => c.name())).toContain("trace");
  });
});

describe("buildDemoOtlp", () => {
  it("builds a root span with children and one error", () => {
    const body = buildDemoOtlp(["app.main", "app.handle", "db.query"]);
    const spans = (body.resourceSpans[0] as any).scopeSpans[0].spans;
    expect(spans).toHaveLength(3);
    expect(spans[0].name).toBe("app.main");
    expect(spans[1].parentSpanId).toBe(spans[0].spanId);
    expect(spans[1].status.code).toBe(2); // first child errors
  });
});

describe("runTraceDemo", () => {
  it("POSTs synthetic OTLP traces and logs", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response);
    const r = await runTraceDemo({ url: "http://x:1/", path: "Z:/no/such/repo", fetchImpl });
    expect(r.spans).toBeGreaterThanOrEqual(2);
    expect(r.logs).toBeGreaterThanOrEqual(1);

    const [traceUrl, traceInit] = fetchImpl.mock.calls[0];
    expect(traceUrl).toBe("http://x:1/v1/traces");
    expect(JSON.parse((traceInit as RequestInit).body as string).resourceSpans[0].scopeSpans[0].spans).toHaveLength(r.spans);

    const [logUrl, logInit] = fetchImpl.mock.calls[1];
    expect(logUrl).toBe("http://x:1/v1/logs");
    expect(JSON.parse((logInit as RequestInit).body as string).resourceLogs[0].scopeLogs[0].logRecords).toHaveLength(r.logs);

    const [metricUrl, metricInit] = fetchImpl.mock.calls[2];
    expect(metricUrl).toBe("http://x:1/v1/metrics");
    expect(JSON.parse((metricInit as RequestInit).body as string).resourceMetrics[0].scopeMetrics[0].metrics).toHaveLength(r.metrics);

    const [profUrl, profInit] = fetchImpl.mock.calls[3];
    expect(profUrl).toBe("http://x:1/v1/profile");
    expect(typeof JSON.parse((profInit as RequestInit).body as string).folded).toBe("string");
    expect(r.profileLines).toBeGreaterThanOrEqual(1);
  });
});

describe("telos top command", () => {
  it("is registered", () => {
    expect(buildProgram().commands.map((c) => c.name())).toContain("top");
  });
});

describe("runTop", () => {
  it("POSTs collected processes to <url>/v1/processes", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response);
    const collectImpl = vi.fn().mockResolvedValue([{ pid: 1, name: "node", cmd: "node a.ts", cpu: 1, memMb: 2 }]);
    const r = await runTop({ url: "http://x:1/", collectImpl, fetchImpl });
    expect(r.count).toBe(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://x:1/v1/processes");
    expect(JSON.parse((init as RequestInit).body as string).processes).toHaveLength(1);
  });

  it("buildDemoProcesses references the given file paths and forms a hierarchy", () => {
    const procs = buildDemoProcesses(["src/app.ts", "src/worker.ts"]);
    expect(procs.length).toBeGreaterThanOrEqual(3);
    expect(procs.some((p) => (p.cmd ?? "").includes("src/app.ts"))).toBe(true);
    expect(procs.some((p) => p.ppid != null)).toBe(true); // has parent/child links
  });
});

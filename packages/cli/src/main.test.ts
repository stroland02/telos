import { describe, it, expect, vi } from "vitest";
import { runScan, runEnrich, runTraceDemo, buildDemoOtlp, runTop, buildDemoProcesses, buildProgram } from "./main.js";
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

  it("buildDemoProcesses references the given file paths", () => {
    const procs = buildDemoProcesses(["src/app.ts", "src/worker.ts"]);
    expect(procs.length).toBeGreaterThanOrEqual(3);
    expect(procs.some((p) => (p.cmd ?? "").includes("src/app.ts"))).toBe(true);
  });
});

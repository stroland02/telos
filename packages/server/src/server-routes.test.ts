// packages/server/src/server-routes.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GraphStore, TelosGraph } from "@telos/engine";
import { recordActivity, recordMcpQuery } from "@telos/harness";
import { buildServer } from "./server.js";
import { GraphService } from "./graphService.js";

const graph: TelosGraph = {
  nodes: [
    { id: "f1", kind: "file", name: "userController.ts", qualifiedName: "src/api/userController.ts", language: "typescript", path: "src/api/userController.ts", lineStart: 1, lineEnd: 1, layer: "api", fanIn: 0, fanOut: 0, lines: 1, complexity: 0, summary: null },
    { id: "s2", kind: "function", name: "findUser", qualifiedName: "src/services/userService.ts::findUser", language: "typescript", path: "src/services/userService.ts", lineStart: 1, lineEnd: 5, layer: "service", fanIn: 1, fanOut: 0, lines: 5, complexity: 1, summary: null },
    { id: "f2", kind: "file", name: "userService.ts", qualifiedName: "src/services/userService.ts", language: "typescript", path: "src/services/userService.ts", lineStart: 1, lineEnd: 1, layer: "service", fanIn: 0, fanOut: 0, lines: 1, complexity: 0, summary: null },
  ],
  edges: [
    { sourceId: "f2", targetId: "s2", kind: "contains", resolved: true },
    { sourceId: "f1", targetId: "s2", kind: "calls", resolved: true },
  ],
};

let dirs: string[] = [];
function service(): GraphService {
  const dir = mkdtempSync(join(tmpdir(), "telos-routes-"));
  dirs.push(dir);
  const dbPath = join(dir, "graph.db");
  const store = GraphStore.open(dbPath);
  store.save(graph);
  store.close();
  return GraphService.fromDb(dbPath);
}
afterEach(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); dirs = []; });

describe("graph routes", () => {
  it("GET /api/overview returns layer view", async () => {
    const svc = service();
    const app = buildServer(svc);
    const res = await app.inject({ method: "GET", url: "/api/overview" });
    expect(res.statusCode).toBe(200);
    expect(res.json().nodes.map((n: any) => n.id).sort()).toEqual(["layer:api", "layer:service"]);
    await app.close(); svc.close();
  });

  it("GET /api/context returns the architecture brief", async () => {
    const svc = service();
    const app = buildServer(svc);
    const res = await app.inject({ method: "GET", url: "/api/context" });
    expect(res.statusCode).toBe(200);
    expect(res.json().brief).toContain("# Architecture context");
    await app.close(); svc.close();
  });

  it("GET /api/stats returns graph counts", async () => {
    const svc = service();
    const app = buildServer(svc);
    const res = await app.inject({ method: "GET", url: "/api/stats" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.nodes).toBeGreaterThan(0);
    expect(Array.isArray(body.languages)).toBe(true);
    await app.close(); svc.close();
  });

  it("GET /api/measure returns the token-savings shape", async () => {
    const svc = service();
    const app = buildServer(svc);
    const res = await app.inject({ method: "GET", url: "/api/measure" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(typeof body.packTokens).toBe("number");
    expect(typeof body.reductionPct).toBe("number");
    expect(body.files).toBeGreaterThan(0);
    await app.close(); svc.close();
  });

  it("POST /v1/resolve stores findings; GET /api/resolve/state returns them", async () => {
    const svc = service();
    const app = buildServer(svc);
    const state = { findings: [{ nodeId: "s2", file: "f", severity: "warn", title: "t", detail: "d", suggestion: "s", agent: "a" }], scanned: 1, startedAt: 0, done: true };
    const post = await app.inject({ method: "POST", url: "/v1/resolve", payload: state });
    expect(post.statusCode).toBe(200);
    const get = await app.inject({ method: "GET", url: "/api/resolve/state" });
    expect(get.json().state.scanned).toBe(1);
    expect(get.json().state.findings[0].nodeId).toBe("s2");
    await app.close(); svc.close();
  });

  it("GET /api/harness/activity returns recorded orchestrations + tally", async () => {
    const dir = mkdtempSync(join(tmpdir(), "telos-activity-routes-"));
    dirs.push(dir);
    const dbPath = join(dir, "graph.db");
    const store = GraphStore.open(dbPath);
    store.save(graph);
    store.close();
    recordActivity(join(dir, ".telos"), { ts: 1, promptSnippet: "build x", intent: "feature build", agents: ["ecc:code-reviewer"], sources: ["ecc"] });
    const svc = GraphService.fromDb(dbPath, dir);
    const app = buildServer(svc);
    const res = await app.inject({ method: "GET", url: "/api/harness/activity" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.entries[0].intent).toBe("feature build");
    expect(body.tally[0]).toEqual({ id: "ecc:code-reviewer", count: 1 });
    await app.close(); svc.close();
  });

  it("GET /api/harness/activity is empty without a repoRoot", async () => {
    const svc = service();
    const app = buildServer(svc);
    const res = await app.inject({ method: "GET", url: "/api/harness/activity" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ entries: [], tally: [] });
    await app.close(); svc.close();
  });

  it("GET /api/harness/config returns the enabled set", async () => {
    const svc = service();
    const app = buildServer(svc);
    const res = await app.inject({ method: "GET", url: "/api/harness/config" });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().enabled)).toBe(true);
    await app.close(); svc.close();
  });

  it("GET /api/activate/state returns the engagement shape", async () => {
    const svc = service();
    const app = buildServer(svc);
    const res = await app.inject({ method: "GET", url: "/api/activate/state" });
    expect(res.statusCode).toBe(200);
    expect(typeof res.json().statusLinePresent).toBe("boolean");
    await app.close(); svc.close();
  });

  it("GET /api/harness returns the cockpit status", async () => {
    const svc = service();
    const app = buildServer(svc);
    const res = await app.inject({ method: "GET", url: "/api/harness" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.installed)).toBe(true);
    expect(body.installed.length).toBeGreaterThan(0);
    expect(body.totals.nodeCapabilities).toBeGreaterThan(0);
    expect(body.drift.status).toBe("ok");
    await app.close(); svc.close();
  });

  it("GET /api/cluster/:id drills down, 404 on unknown", async () => {
    const svc = service();
    const app = buildServer(svc);
    const ok = await app.inject({ method: "GET", url: "/api/cluster/layer:api" });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().nodes[0].id).toBe("module:api:src/api");
    const missing = await app.inject({ method: "GET", url: "/api/cluster/nope" });
    expect(missing.statusCode).toBe(404);
    await app.close(); svc.close();
  });

  it("GET /api/node/:id returns detail, 404 on unknown", async () => {
    const svc = service();
    const app = buildServer(svc);
    const ok = await app.inject({ method: "GET", url: "/api/node/s2" });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().node.name).toBe("findUser");
    const missing = await app.inject({ method: "GET", url: "/api/node/nope" });
    expect(missing.statusCode).toBe(404);
    await app.close(); svc.close();
  });

  it("GET /api/search returns results, empty when q blank", async () => {
    const svc = service();
    const app = buildServer(svc);
    const hit = await app.inject({ method: "GET", url: "/api/search?q=findUser" });
    expect(hit.json().results.map((n: any) => n.id)).toContain("s2");
    const blank = await app.inject({ method: "GET", url: "/api/search" });
    expect(blank.json()).toEqual({ results: [] });
    await app.close(); svc.close();
  });

  it("GET /api/harness/mcp-activity returns recorded queries + totals", async () => {
    const dir = mkdtempSync(join(tmpdir(), "telos-mcp-activity-routes-"));
    dirs.push(dir);
    const dbPath = join(dir, "graph.db");
    const store = GraphStore.open(dbPath);
    store.save(graph);
    store.close();
    recordMcpQuery(join(dir, ".telos"), { ts: 1, tool: "telos_ask", argsSummary: "q", resultTokens: 7 });
    const svc = GraphService.fromDb(dbPath, dir);
    const app = buildServer(svc);
    const res = await app.inject({ method: "GET", url: "/api/harness/mcp-activity" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.entries[0].tool).toBe("telos_ask");
    expect(body.totals).toEqual({ queries: 1, tokens: 7 });
    await app.close(); svc.close();
  });

  it("GET /api/harness/mcp-activity is empty without a repoRoot", async () => {
    const svc = service();
    const app = buildServer(svc);
    const res = await app.inject({ method: "GET", url: "/api/harness/mcp-activity" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ entries: [], totals: { queries: 0, tokens: 0 } });
    await app.close(); svc.close();
  });

  it("GET /api/harness/mcp-activity returns fallback when provider lacks the method", async () => {
    const minimalProvider: any = {
      getOverview: () => ({}),
      getChildren: () => null,
      getNode: () => null,
      search: () => [],
      getFiles: () => [],
      getFilePaths: () => new Set<string>(),
      repoRoot: null,
      // Intentionally omit getMcpActivity to test the route's else-branch
    };
    const app = buildServer(minimalProvider);
    const res = await app.inject({ method: "GET", url: "/api/harness/mcp-activity" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ entries: [], totals: { queries: 0, tokens: 0 } });
    await app.close();
  });

  it("POST /api/context/build enriches the graph and returns node counts", async () => {
    const dir = mkdtempSync(join(tmpdir(), "telos-build-routes-"));
    dirs.push(dir);
    const dbPath = join(dir, "graph.db");
    const store = GraphStore.open(dbPath);
    store.save(graph);
    store.close();
    const svc = GraphService.fromDb(dbPath, dir);
    const app = buildServer(svc);
    const res = await app.inject({ method: "POST", url: "/api/context/build" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBeGreaterThan(0);
    expect(body.enriched).toBe(body.total); // heuristic enricher summarizes every node
    await app.close(); svc.close();
  });

  it("GET /api/harness/usage returns rolling agent/source usage", async () => {
    const dir = mkdtempSync(join(tmpdir(), "telos-usage-routes-"));
    dirs.push(dir);
    const dbPath = join(dir, "graph.db");
    const store = GraphStore.open(dbPath);
    store.save(graph);
    store.close();
    recordActivity(join(dir, ".telos"), { ts: 1, promptSnippet: "p", intent: "bug fix", agents: ["ecc:typescript-reviewer", "superpowers:brainstorming"], sources: [] });
    recordActivity(join(dir, ".telos"), { ts: 2, promptSnippet: "q", intent: "bug fix", agents: ["ecc:typescript-reviewer"], sources: [] });
    const svc = GraphService.fromDb(dbPath, dir);
    const app = buildServer(svc);
    const res = await app.inject({ method: "GET", url: "/api/harness/usage" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.windowPrompts).toBe(2);
    expect(body.agents[0]).toEqual({ id: "ecc:typescript-reviewer", count: 2, lastTs: 2 });
    expect(body.sources.find((s: { source: string }) => s.source === "ecc").count).toBe(2);
    await app.close(); svc.close();
  });

  it("GET /api/harness/usage returns fallback when provider lacks the method", async () => {
    const minimalProvider: any = {
      getOverview: () => ({}), getChildren: () => null, getNode: () => null,
      search: () => [], getFiles: () => [], getFilePaths: () => new Set<string>(), repoRoot: null,
      // Intentionally omit getUsage to test the route's else-branch
    };
    const app = buildServer(minimalProvider);
    const res = await app.inject({ method: "GET", url: "/api/harness/usage" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ windowPrompts: 0, agents: [], sources: [] });
    await app.close();
  });

  it("GET /api/harness/history returns per-day usage + injected-token trend", async () => {
    const dir = mkdtempSync(join(tmpdir(), "telos-history-routes-"));
    dirs.push(dir);
    const dbPath = join(dir, "graph.db");
    const store = GraphStore.open(dbPath);
    store.save(graph);
    store.close();
    const day1 = Date.parse("2026-06-20T10:00:00Z");
    const day2 = Date.parse("2026-06-21T10:00:00Z");
    recordActivity(join(dir, ".telos"), { ts: day1, promptSnippet: "p", intent: "bug fix", agents: ["ecc:typescript-reviewer"], sources: [], injectedTokens: 100 });
    recordActivity(join(dir, ".telos"), { ts: day1 + 1000, promptSnippet: "q", intent: "feature", agents: ["superpowers:brainstorming"], sources: [], injectedTokens: 50 });
    recordActivity(join(dir, ".telos"), { ts: day2, promptSnippet: "r", intent: "bug fix", agents: ["ecc:typescript-reviewer"], sources: [], injectedTokens: 200 });
    const svc = GraphService.fromDb(dbPath, dir);
    const app = buildServer(svc);
    const res = await app.inject({ method: "GET", url: "/api/harness/history" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.totalPrompts).toBe(3);
    expect(body.totalInjected).toBe(350);
    expect(body.distinctAgents).toBe(2);
    expect(body.days).toHaveLength(2);
    expect(body.days[0]).toEqual({ day: "2026-06-20", prompts: 2, agents: 2, injectedTokens: 150 });
    expect(body.days[1]).toEqual({ day: "2026-06-21", prompts: 1, agents: 1, injectedTokens: 200 });
    await app.close(); svc.close();
  });

  it("GET /api/harness/history returns fallback when provider lacks the method", async () => {
    const minimalProvider: any = {
      getOverview: () => ({}), getChildren: () => null, getNode: () => null,
      search: () => [], getFiles: () => [], getFilePaths: () => new Set<string>(), repoRoot: null,
      // Intentionally omit getHistory to test the route's else-branch
    };
    const app = buildServer(minimalProvider);
    const res = await app.inject({ method: "GET", url: "/api/harness/history" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ totalPrompts: 0, totalInjected: 0, distinctAgents: 0, firstTs: null, lastTs: null, days: [] });
    await app.close();
  });
});

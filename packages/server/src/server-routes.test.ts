// packages/server/src/server-routes.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GraphStore, TelosGraph } from "@telos/engine";
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
});

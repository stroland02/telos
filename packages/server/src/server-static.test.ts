import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildServer, GraphProvider } from "./server.js";

const stub: GraphProvider = { getOverview: () => ({ nodes: [], edges: [] }), getChildren: () => null, getNode: () => null, search: () => [] };

let dirs: string[] = [];
function staticDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "telos-static-"));
  dirs.push(dir);
  mkdirSync(join(dir, "assets"), { recursive: true });
  writeFileSync(join(dir, "index.html"), "<!doctype html><title>Telos</title><div id=root></div>");
  return dir;
}
afterEach(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); dirs = []; });

describe("static hosting", () => {
  it("serves index.html at / when a staticDir is given", async () => {
    const app = buildServer(stub, { staticDir: staticDir() });
    const res = await app.inject({ method: "GET", url: "/" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("Telos");
    await app.close();
  });

  it("still serves the API alongside static assets", async () => {
    const app = buildServer(stub, { staticDir: staticDir() });
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.json()).toEqual({ status: "ok" });
    await app.close();
  });

  it("works with no staticDir (API-only)", async () => {
    const app = buildServer(stub);
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

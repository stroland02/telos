// packages/server/src/server-files.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, sep } from "node:path";
import { GraphStore, TelosGraph } from "@telos/engine";
import { buildServer } from "./server.js";
import { GraphService } from "./graphService.js";

const graph: TelosGraph = {
  nodes: [
    {
      id: "f1", kind: "file", name: "index.ts",
      qualifiedName: "src/index.ts", language: "typescript",
      path: "src/index.ts", lineStart: 1, lineEnd: 1,
      layer: "api", fanIn: 0, fanOut: 1, lines: 10, complexity: 0, summary: null,
    },
    {
      id: "f2", kind: "file", name: "utils.ts",
      qualifiedName: "src/utils/utils.ts", language: "typescript",
      path: "src/utils/utils.ts", lineStart: 1, lineEnd: 1,
      layer: "util", fanIn: 1, fanOut: 0, lines: 20, complexity: 0, summary: null,
    },
    {
      id: "s1", kind: "function", name: "helper",
      qualifiedName: "src/utils/utils.ts::helper", language: "typescript",
      path: "src/utils/utils.ts", lineStart: 3, lineEnd: 8,
      layer: "util", fanIn: 0, fanOut: 0, lines: 6, complexity: 1, summary: null,
    },
  ],
  edges: [
    { sourceId: "f1", targetId: "s1", kind: "calls", resolved: true },
    { sourceId: "f2", targetId: "s1", kind: "contains", resolved: true },
  ],
};

let dirs: string[] = [];

function setup(extraFiles?: Record<string, string>): { svc: GraphService; repoRoot: string } {
  const dir = mkdtempSync(join(tmpdir(), "telos-files-"));
  dirs.push(dir);
  const dbPath = join(dir, "graph.db");
  const store = GraphStore.open(dbPath);
  store.save(graph);
  store.close();

  if (extraFiles) {
    for (const [relPath, content] of Object.entries(extraFiles)) {
      // relPath uses forward slashes; convert to OS sep for join
      const parts = relPath.split("/");
      const absPath = join(dir, ...parts);
      mkdirSync(dirname(absPath), { recursive: true });
      writeFileSync(absPath, content, "utf-8");
    }
  }

  const svc = GraphService.fromDb(dbPath, dir);
  return { svc, repoRoot: dir };
}

afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

// ─── /api/files ──────────────────────────────────────────────────────────────

describe("GET /api/files", () => {
  it("returns sorted list of file-node paths", async () => {
    const { svc } = setup();
    const app = buildServer(svc);
    const res = await app.inject({ method: "GET", url: "/api/files" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ files: string[] }>();
    expect(body.files).toEqual(["src/index.ts", "src/utils/utils.ts"]);
    await app.close(); svc.close();
  });

  it("excludes non-file nodes", async () => {
    const { svc } = setup();
    const app = buildServer(svc);
    const res = await app.inject({ method: "GET", url: "/api/files" });
    const body = res.json<{ files: string[] }>();
    expect(body.files).toHaveLength(2);
    await app.close(); svc.close();
  });
});

// ─── /api/source ─────────────────────────────────────────────────────────────

describe("GET /api/source", () => {
  it("returns content and line count for a known file on disk", async () => {
    const content = "const x = 1;\nconst y = 2;\n";
    const { svc } = setup({ "src/index.ts": content });
    const app = buildServer(svc);
    const res = await app.inject({ method: "GET", url: "/api/source?path=src%2Findex.ts" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ path: string; content: string; lines: number }>();
    expect(body.path).toBe("src/index.ts");
    expect(body.content).toBe(content);
    expect(body.lines).toBe(2);
    await app.close(); svc.close();
  });

  it("rejects ../ path traversal with 400", async () => {
    const { svc } = setup();
    const app = buildServer(svc);
    const res = await app.inject({ method: "GET", url: "/api/source?path=..%2Fetc%2Fpasswd" });
    expect(res.statusCode).toBe(400);
    await app.close(); svc.close();
  });

  it("rejects absolute path with 400", async () => {
    const { svc } = setup();
    const app = buildServer(svc);
    const res = await app.inject({ method: "GET", url: "/api/source?path=%2Fetc%2Fpasswd" });
    expect(res.statusCode).toBe(400);
    await app.close(); svc.close();
  });

  it("returns 400 for path not in graph (defense in depth)", async () => {
    const { svc } = setup();
    const app = buildServer(svc);
    const res = await app.inject({ method: "GET", url: "/api/source?path=src%2Fnot-in-graph.ts" });
    expect(res.statusCode).toBe(400);
    await app.close(); svc.close();
  });

  it("returns 404 when file is in graph but missing from disk", async () => {
    const { svc } = setup(/* no disk files */);
    const app = buildServer(svc);
    const res = await app.inject({ method: "GET", url: "/api/source?path=src%2Findex.ts" });
    expect(res.statusCode).toBe(404);
    await app.close(); svc.close();
  });

  it("returns 400 when path query param is missing", async () => {
    const { svc } = setup();
    const app = buildServer(svc);
    const res = await app.inject({ method: "GET", url: "/api/source" });
    expect(res.statusCode).toBe(400);
    await app.close(); svc.close();
  });
});

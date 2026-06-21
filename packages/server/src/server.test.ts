import { describe, it, expect } from "vitest";
import { buildServer, GraphProvider } from "./server.js";

const stub: GraphProvider = {
  getOverview: () => ({ nodes: [], edges: [] }),
  getChildren: () => null,
  getNode: () => null,
  search: () => [],
  getFiles: () => [],
  getFilePaths: () => new Set(),
  repoRoot: null,
};

describe("buildServer health", () => {
  it("GET /api/health returns ok", async () => {
    const app = buildServer(stub);
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
    await app.close();
  });
});

import Fastify, { FastifyInstance } from "fastify";

export interface GraphProvider {
  getOverview(): unknown;
  getChildren(id: string): unknown | null;
  getNode(id: string): unknown | null;
  search(q: string): unknown[];
}

export function buildServer(_provider: GraphProvider): FastifyInstance {
  const app = Fastify({ logger: false });
  app.get("/api/health", async () => ({ status: "ok" }));
  return app;
}

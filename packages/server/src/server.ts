import Fastify, { FastifyInstance } from "fastify";

export interface GraphProvider {
  getOverview(): unknown;
  getChildren(id: string): unknown | null;
  getNode(id: string): unknown | null;
  search(q: string): unknown[];
}

export function buildServer(provider: GraphProvider): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/api/health", async () => ({ status: "ok" }));

  app.get("/api/overview", async () => provider.getOverview());

  app.get<{ Params: { id: string } }>("/api/cluster/:id", async (req, reply) => {
    const view = provider.getChildren(req.params.id);
    if (view === null) return reply.code(404).send({ error: "cluster not found" });
    return view;
  });

  app.get<{ Params: { id: string } }>("/api/node/:id", async (req, reply) => {
    const detail = provider.getNode(req.params.id);
    if (detail === null) return reply.code(404).send({ error: "node not found" });
    return detail;
  });

  app.get<{ Querystring: { q?: string } }>("/api/search", async (req) => {
    const q = (req.query.q ?? "").trim();
    return { results: q.length === 0 ? [] : provider.search(q) };
  });

  return app;
}

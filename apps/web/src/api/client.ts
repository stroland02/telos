import { GraphView, NodeDetail, TelosNodeDTO, SourceResult } from "./types";

export interface TelosApi {
  overview(): Promise<GraphView>;
  cluster(id: string): Promise<GraphView | null>;
  node(id: string): Promise<NodeDetail | null>;
  search(q: string): Promise<TelosNodeDTO[]>;
  files(): Promise<string[]>;
  source(path: string): Promise<SourceResult | null>;
}

export function createApi(baseUrl = ""): TelosApi {
  const get = async <T>(path: string): Promise<T> => {
    const res = await fetch(`${baseUrl}${path}`);
    if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
    return (await res.json()) as T;
  };
  const getOrNull = async <T>(path: string): Promise<T | null> => {
    const res = await fetch(`${baseUrl}${path}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
    return (await res.json()) as T;
  };
  return {
    overview: () => get<GraphView>("/api/overview"),
    cluster: (id) => getOrNull<GraphView>(`/api/cluster/${encodeURIComponent(id)}`),
    node: (id) => getOrNull<NodeDetail>(`/api/node/${encodeURIComponent(id)}`),
    search: async (q) => (await get<{ results: TelosNodeDTO[] }>(`/api/search?q=${encodeURIComponent(q)}`)).results,
    files: async () => (await get<{ files: string[] }>("/api/files")).files,
    source: (path) => getOrNull<SourceResult>(`/api/source?path=${encodeURIComponent(path)}`),
  };
}

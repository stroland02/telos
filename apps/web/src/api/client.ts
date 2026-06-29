import { GraphView, NodeDetail, TelosNodeDTO, SourceResult, Recommendation, TourStop, Answer, TraceState, TraceSummary, TracePathStep, LogLine, MetricSeries, ProfileSnapshot, ProcessSample, ForgeState, HarnessStatus, GraphStats, ResolveState, TokenSavings, ActivityFeed, McpActivityFeed, UsageStats, HistoryStats } from "./types";

export interface TelosApi {
  overview(): Promise<GraphView>;
  cluster(id: string): Promise<GraphView | null>;
  node(id: string): Promise<NodeDetail | null>;
  search(q: string): Promise<TelosNodeDTO[]>;
  files(): Promise<string[]>;
  source(path: string): Promise<SourceResult | null>;
  recommendations(id: string): Promise<Recommendation[]>;
  tour(limit?: number): Promise<TourStop[]>;
  ask(question: string, limit?: number): Promise<Answer[]>;
  /** One-shot live trace snapshot (poll fallback). */
  traceState(): Promise<TraceState>;
  /** Subscribe to the live trace SSE stream; returns an unsubscribe fn. */
  subscribeTrace(onState: (s: TraceState) => void, onError?: () => void): () => void;
  /** Recent traces, newest first (playback picker). */
  recentTraces(limit?: number): Promise<TraceSummary[]>;
  /** One trace's chronological node path (playback animation). */
  traceReplay(traceId: string): Promise<TracePathStep[]>;
  /** Recent logs scoped to a node (or all if no id). */
  nodeLogs(nodeId?: string, limit?: number): Promise<LogLine[]>;
  /** Per-node metric series (latest + recent points). */
  nodeMetrics(nodeId: string, limit?: number): Promise<MetricSeries[]>;
  /** Hot-path profile snapshot (self/total samples per node). */
  profile(limit?: number): Promise<ProfileSnapshot>;
  /** Latest local process snapshot (CPU-sorted, node-tagged). */
  processes(limit?: number): Promise<ProcessSample[]>;
  /** Subscribe to the Forge build-loop SSE stream; returns an unsubscribe fn. */
  subscribeForge(onState: (s: ForgeState) => void, onError?: () => void): () => void;
  /** Subscribe to the Resolve (scan-for-resolutions) SSE stream; returns unsubscribe. */
  subscribeResolve(onState: (s: ResolveState) => void, onError?: () => void): () => void;
  /** Harness cockpit: installed harnesses, enabled capability counts, drift. */
  harnessStatus(): Promise<HarnessStatus>;
  /** Graph-as-memory: the token-budgeted architecture brief (markdown). */
  contextPack(): Promise<string>;
  /** Build/refresh graph memory (enrich + persist); returns node counts. */
  buildMemory(): Promise<{ enriched: number; total: number }>;
  /** Token savings: cold-read source baseline vs the warm-start brief. */
  measure(): Promise<TokenSavings>;
  /** Lightweight graph stats for the control rail footer. */
  stats(): Promise<GraphStats>;
  /** Harness engagement: write/remove the Claude Code statusline. */
  activate(deactivate?: boolean): Promise<{ statusLinePresent: boolean }>;
  activationState(): Promise<{ statusLinePresent: boolean }>;
  /** Which harnesses are selected/active (autopilot). */
  harnessConfig(): Promise<{ enabled: string[] }>;
  harnessSelect(source: string, enabled: boolean): Promise<{ enabled: string[] }>;
  /** Recent harness orchestrations + agent tally for the activity feed. */
  harnessActivity(): Promise<ActivityFeed>;
  /** Recent MCP graph queries + totals for the control panel. */
  mcpActivity(): Promise<McpActivityFeed>;
  /** Rolling agent/harness usage over the recent routed-prompt window. */
  usage(): Promise<UsageStats>;
  /** Longevity view: per-day usage + injected-token trend over the project's life. */
  history(): Promise<HistoryStats>;
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
    recommendations: async (id) =>
      (await get<{ recommendations: Recommendation[] }>(`/api/node/${encodeURIComponent(id)}/recommend`)).recommendations,
    tour: async (limit) =>
      (await get<{ stops: TourStop[] }>(`/api/tour${limit ? `?limit=${limit}` : ""}`)).stops,
    ask: async (question, limit) =>
      (await get<{ answers: Answer[] }>(`/api/ask?q=${encodeURIComponent(question)}${limit ? `&limit=${limit}` : ""}`)).answers,
    traceState: () => get<TraceState>("/api/trace/state"),
    subscribeTrace: (onState, onError) => {
      const es = new EventSource(`${baseUrl}/api/trace/stream`);
      es.onmessage = (ev) => {
        try { onState(JSON.parse(ev.data) as TraceState); } catch { /* ignore bad frame */ }
      };
      es.onerror = () => onError?.();
      return () => es.close();
    },
    recentTraces: async (limit) =>
      (await get<{ traces: TraceSummary[] }>(`/api/trace/recent${limit ? `?limit=${limit}` : ""}`)).traces,
    traceReplay: async (traceId) =>
      (await get<{ steps: TracePathStep[] }>(`/api/trace/replay/${encodeURIComponent(traceId)}`)).steps,
    nodeLogs: async (nodeId, limit) => {
      const params = new URLSearchParams();
      if (nodeId) params.set("node", nodeId);
      if (limit) params.set("limit", String(limit));
      const qs = params.toString();
      return (await get<{ logs: LogLine[] }>(`/api/logs${qs ? `?${qs}` : ""}`)).logs;
    },
    nodeMetrics: async (nodeId, limit) =>
      (await get<{ series: MetricSeries[] }>(`/api/metrics?node=${encodeURIComponent(nodeId)}${limit ? `&limit=${limit}` : ""}`)).series,
    profile: (limit) => get<ProfileSnapshot>(`/api/profile${limit ? `?limit=${limit}` : ""}`),
    processes: async (limit) =>
      (await get<{ processes: ProcessSample[] }>(`/api/processes${limit ? `?limit=${limit}` : ""}`)).processes,
    subscribeForge: (onState, onError) => {
      const es = new EventSource(`${baseUrl}/api/forge/stream`);
      es.onmessage = (ev) => {
        try { onState(JSON.parse(ev.data) as ForgeState); } catch { /* ignore bad frame */ }
      };
      es.onerror = () => onError?.();
      return () => es.close();
    },
    subscribeResolve: (onState, onError) => {
      const es = new EventSource(`${baseUrl}/api/resolve/stream`);
      es.onmessage = (ev) => {
        try { onState(JSON.parse(ev.data) as ResolveState); } catch { /* ignore bad frame */ }
      };
      es.onerror = () => onError?.();
      return () => es.close();
    },
    harnessStatus: () => get<HarnessStatus>("/api/harness"),
    contextPack: async () => (await get<{ brief: string }>("/api/context")).brief,
    buildMemory: async () => {
      const res = await fetch(`${baseUrl}/api/context/build`, { method: "POST" });
      if (!res.ok) throw new Error(`buildMemory -> ${res.status}`);
      return (await res.json()) as { enriched: number; total: number };
    },
    measure: async () => get<TokenSavings>("/api/measure"),
    stats: () => get<GraphStats>("/api/stats"),
    activate: async (deactivate) => {
      const res = await fetch(`${baseUrl}/api/activate`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ deactivate: !!deactivate }),
      });
      if (!res.ok) throw new Error(`activate -> ${res.status}`);
      return (await res.json()) as { statusLinePresent: boolean };
    },
    activationState: () => get<{ statusLinePresent: boolean }>("/api/activate/state"),
    harnessConfig: () => get<{ enabled: string[] }>("/api/harness/config"),
    harnessSelect: async (source, enabled) => {
      const res = await fetch(`${baseUrl}/api/harness/select`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source, enabled }),
      });
      if (!res.ok) throw new Error(`harnessSelect -> ${res.status}`);
      return (await res.json()) as { enabled: string[] };
    },
    harnessActivity: () => get<ActivityFeed>("/api/harness/activity"),
    mcpActivity: () => get<McpActivityFeed>("/api/harness/mcp-activity"),
    usage: () => get<UsageStats>("/api/harness/usage"),
    history: () => get<HistoryStats>("/api/harness/history"),
  };
}

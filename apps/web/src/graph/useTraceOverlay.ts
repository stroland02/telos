import { useEffect, useMemo, useState } from "react";
import type { TelosApi } from "../api/client";
import type { TraceState, TraceNodeSignal, TraceEdgeSignal } from "../api/types";

export interface TraceOverlay {
  state: TraceState | null;
  nodeSignal: (id: string) => TraceNodeSignal | undefined;
  edgeSignal: (sourceId: string, targetId: string) => TraceEdgeSignal | undefined;
  totalCalls: number;
}

const EMPTY: TraceOverlay = {
  state: null,
  nodeSignal: () => undefined,
  edgeSignal: () => undefined,
  totalCalls: 0,
};

/**
 * Subscribes to the live trace SSE stream while `enabled`. Holds the latest
 * TraceState and exposes O(1) per-node / per-edge signal lookups for the map.
 * Purely additive: when disabled it returns an empty overlay and the map is
 * unaffected.
 */
export function useTraceOverlay(api: TelosApi, enabled: boolean): TraceOverlay {
  const [state, setState] = useState<TraceState | null>(null);

  useEffect(() => {
    if (!enabled) { setState(null); return; }
    const unsubscribe = api.subscribeTrace(setState, () => {/* keep last state */});
    return unsubscribe;
  }, [api, enabled]);

  return useMemo(() => {
    if (!state) return EMPTY;
    const nodes = new Map(state.nodes.map((n) => [n.id, n]));
    const edges = new Map(state.edges.map((e) => [`${e.sourceId} ${e.targetId}`, e]));
    const totalCalls = state.nodes.reduce((sum, n) => sum + n.calls, 0);
    return {
      state,
      nodeSignal: (id) => nodes.get(id),
      edgeSignal: (s, t) => edges.get(`${s} ${t}`),
      totalCalls,
    };
  }, [state]);
}

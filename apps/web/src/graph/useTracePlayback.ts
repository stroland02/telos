import { useCallback, useEffect, useRef, useState } from "react";
import type { TelosApi } from "../api/client";
import type { TracePathStep } from "../api/types";

export interface Playback {
  playing: boolean;
  activeTraceId: string | null;
  activeNodeId: string | null;
  step: number;   // index of the current step, or -1 when idle
  total: number;
  play: (traceId: string) => Promise<void>;
  stop: () => void;
}

/**
 * Replays a recorded trace as a chronological walk through the map: steps the
 * active node forward on a timer. Purely additive — when idle, activeNodeId is
 * null and the map is unaffected.
 */
export function useTracePlayback(api: TelosApi, opts: { stepMs?: number } = {}): Playback {
  const stepMs = opts.stepMs ?? 600;
  const [steps, setSteps] = useState<TracePathStep[]>([]);
  const [idx, setIdx] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [activeTraceId, setActiveTraceId] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const clear = useCallback(() => {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
  }, []);

  const stop = useCallback(() => {
    clear();
    setPlaying(false);
    setIdx(-1);
    setActiveTraceId(null);
  }, [clear]);

  const play = useCallback(async (traceId: string) => {
    clear();
    const path = await api.traceReplay(traceId);
    setSteps(path);
    setActiveTraceId(traceId);
    if (path.length === 0) { setIdx(-1); setPlaying(false); return; }
    setIdx(0);
    setPlaying(true);
    timer.current = setInterval(() => {
      setIdx((i) => {
        if (i + 1 >= path.length) { clear(); setPlaying(false); return i; }
        return i + 1;
      });
    }, stepMs);
  }, [api, stepMs, clear]);

  useEffect(() => () => clear(), [clear]);

  return {
    playing,
    activeTraceId,
    activeNodeId: idx >= 0 ? steps[idx]?.nodeId ?? null : null,
    step: idx,
    total: steps.length,
    play,
    stop,
  };
}

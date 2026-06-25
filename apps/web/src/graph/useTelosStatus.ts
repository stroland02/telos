import { useEffect, useState } from "react";
import { TelosApi } from "../api/client";
import { TelosStatus } from "../api/types";

const EMPTY: TelosStatus = { graph: null, harness: null, live: null, procs: null, forge: null };

/**
 * Assembles the Control Rail's live status from EXISTING reads/streams. Each
 * field updates independently (Promise.allSettled), so one failing endpoint never
 * blanks the others. Light reads poll on an interval; Forge layers in via SSE.
 */
export function useTelosStatus(api: TelosApi, intervalMs = 5000): TelosStatus {
  const [status, setStatus] = useState<TelosStatus>(EMPTY);

  useEffect(() => {
    let alive = true;

    const poll = async () => {
      const [stats, harness, trace, procs] = await Promise.allSettled([
        api.stats(), api.harnessStatus(), api.traceState(), api.processes(),
      ]);
      if (!alive) return;
      setStatus((prev) => ({
        ...prev,
        graph: stats.status === "fulfilled" ? stats.value : prev.graph,
        harness: harness.status === "fulfilled"
          ? { caps: harness.value.totals.nodeCapabilities, drift: harness.value.drift.status }
          : prev.harness,
        live: trace.status === "fulfilled"
          ? { calls: trace.value.nodes.reduce((s, n) => s + n.calls, 0) }
          : prev.live,
        procs: procs.status === "fulfilled" ? procs.value.length : prev.procs,
      }));
    };

    poll();
    const id = setInterval(poll, intervalMs);
    const unsub = api.subscribeForge((s) => {
      if (alive) setStatus((prev) => ({ ...prev, forge: { turn: s.turn, costUsd: s.costUsd, stop: s.stop } }));
    });

    return () => { alive = false; clearInterval(id); unsub(); };
  }, [api, intervalMs]);

  return status;
}

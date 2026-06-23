import { useEffect, useMemo, useState } from "react";
import type { TelosApi } from "../api/client";
import type { ProfileSnapshot } from "../api/types";

export interface ProfileOverlay {
  snapshot: ProfileSnapshot | null;
  /** Hot-path intensity 0..1 for a node (by total samples, normalized to the
   *  hottest node). 0 when off or unmeasured. */
  intensity: (nodeId: string) => number;
  totalSamples: number;
}

const EMPTY: ProfileOverlay = { snapshot: null, intensity: () => 0, totalSamples: 0 };

/**
 * Fetches the hot-path profile snapshot when enabled and exposes a normalized
 * per-node intensity for map heat. Purely additive — off ⇒ intensity 0.
 */
export function useProfileOverlay(api: TelosApi, enabled: boolean): ProfileOverlay {
  const [snapshot, setSnapshot] = useState<ProfileSnapshot | null>(null);

  useEffect(() => {
    if (!enabled) { setSnapshot(null); return; }
    let alive = true;
    api.profile().then((s) => { if (alive) setSnapshot(s); }).catch(() => { if (alive) setSnapshot(null); });
    return () => { alive = false; };
  }, [api, enabled]);

  return useMemo(() => {
    if (!snapshot || snapshot.nodes.length === 0) return EMPTY;
    const maxTotal = Math.max(...snapshot.nodes.map((n) => n.total), 1);
    const byId = new Map(snapshot.nodes.map((n) => [n.nodeId, n]));
    return {
      snapshot,
      intensity: (id) => {
        const n = byId.get(id);
        return n ? n.total / maxTotal : 0;
      },
      totalSamples: snapshot.totalSamples,
    };
  }, [snapshot]);
}

import { useCallback, useEffect, useState } from "react";
import { TelosApi } from "../api/client";
import { GraphView } from "../api/types";

export interface Crumb { id: string | null; label: string; }
export interface NavigationState {
  view: GraphView | null;
  crumbs: Crumb[];
  loading: boolean;
  error: string | null;
  drillInto(node: { id: string; label: string; level: string }): void;
  goToCrumb(index: number): void;
}

export function useNavigation(api: TelosApi): NavigationState {
  const [view, setView] = useState<GraphView | null>(null);
  const [crumbs, setCrumbs] = useState<Crumb[]>([{ id: null, label: "Overview" }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLevel = useCallback(async (id: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const next = id === null ? await api.overview() : await api.cluster(id);
      if (next !== null) setView(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void loadLevel(null); }, [loadLevel]);

  const drillInto = useCallback((node: { id: string; label: string; level: string }) => {
    if (node.level === "symbol") return;
    setLoading(true);
    setError(null);
    api.cluster(node.id).then((next) => {
      if (next !== null) {
        setView(next);
        setCrumbs((cs) => [...cs, { id: node.id, label: node.label }]);
      }
    }).catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [api]);

  const goToCrumb = useCallback((index: number) => {
    setCrumbs((cs) => {
      const truncated = cs.slice(0, index + 1);
      void loadLevel(truncated[truncated.length - 1].id);
      return truncated;
    });
  }, [loadLevel]);

  return { view, crumbs, loading, error, drillInto, goToCrumb };
}

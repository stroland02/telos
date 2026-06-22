/**
 * PathFinder — BFS-based "find path between two nodes" tool.
 *
 * UX: two-phase click selection.
 *   Phase 1 (idle): user activates the tool (button), then clicks a source node.
 *   Phase 2 (source set): user clicks a target node → BFS runs → path highlighted.
 *   Reset: clicking the tool button again, or pressing Escape.
 *
 * Visual encoding (design direction §4):
 *   - Path edges: --accent stroke, full opacity.
 *   - Path nodes: --accent ring (selected treatment).
 *   - Off-path edges/nodes: dimmed to 0.15 opacity.
 *   No re-layout. Pure style overlay on existing ReactFlow nodes/edges.
 *
 * Research:
 *   - BFS shortest-path: standard for unweighted directed graphs (CLRS §22.2).
 *   - Understand-Anything "Path / P" feature: two-pick UI, accent highlight.
 *   - WCAG: status region (aria-live) for path result; button aria-pressed for mode.
 */

export interface PathFinderState {
  /** Whether the path-finder tool is active (waiting for picks). */
  active: boolean;
  /** The source node ID picked by the user (step 1). */
  sourceId: string | null;
  /** The found path as an ordered array of node IDs, or null if none found yet. */
  path: string[] | null;
  /** True after target was picked but no path exists. */
  noPath: boolean;
}

export const PATH_FINDER_IDLE: PathFinderState = {
  active: false,
  sourceId: null,
  path: null,
  noPath: false,
};

/** BFS over a directed edge list. Returns the shortest path (node IDs) or null. */
export function bfsPath(
  sourceId: string,
  targetId: string,
  edges: Array<{ source: string; target: string }>,
): string[] | null {
  if (sourceId === targetId) return [sourceId];

  // Build adjacency list (directed: source → target).
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const list = adj.get(e.source);
    if (list) list.push(e.target);
    else adj.set(e.source, [e.target]);
  }

  const visited = new Set<string>([sourceId]);
  const parent = new Map<string, string>();
  const queue: string[] = [sourceId];

  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const next of adj.get(cur) ?? []) {
      if (visited.has(next)) continue;
      visited.add(next);
      parent.set(next, cur);
      if (next === targetId) {
        // Reconstruct path.
        const path: string[] = [targetId];
        let node = targetId;
        while (parent.has(node)) {
          node = parent.get(node)!;
          path.unshift(node);
        }
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}

/** Floating status/control bar for the PathFinder tool. */
export function PathFinderBar({
  state,
  onActivate,
  onReset,
  sourceLabel,
}: {
  state: PathFinderState;
  onActivate: () => void;
  onReset: () => void;
  sourceLabel?: string;
}) {
  const label = state.active
    ? state.sourceId
      ? `Pick target node  (source: ${sourceLabel ?? state.sourceId})`
      : "Click a source node"
    : "Find path";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--s-2)",
        background: "var(--surface)",
        border: `1px solid ${state.active ? "var(--accent)" : "var(--border)"}`,
        borderRadius: "var(--r-md)",
        padding: "var(--s-1) var(--s-3)",
        boxShadow: state.active ? "0 0 0 1px var(--accent-soft), -2px 4px 16px rgba(0,0,0,.28)" : "-2px 4px 16px rgba(0,0,0,.28)",
        transition: "border-color 120ms ease, box-shadow 120ms ease",
        pointerEvents: "auto",
      }}
    >
      {/* Path icon */}
      <span aria-hidden="true" style={{ color: state.active ? "var(--accent)" : "var(--text-faint)", fontSize: 14, lineHeight: 1, userSelect: "none" }}>
        ⇝
      </span>

      {/* Toggle button */}
      <button
        role="button"
        aria-pressed={state.active}
        aria-label={state.active ? "Cancel path finder" : "Activate path finder"}
        onClick={state.active ? onReset : onActivate}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
          fontFamily: "var(--font-ui)",
          fontSize: "var(--t-meta-size)",
          lineHeight: "var(--t-meta-lh)",
          color: state.active ? "var(--accent)" : "var(--text-muted)",
          fontWeight: state.active ? 500 : 400,
          transition: "color 120ms ease",
          outline: "none",
          whiteSpace: "nowrap",
        }}
        onFocus={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "0 0 0 2px var(--accent)"; }}
        onBlur={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}
      >
        {label}
      </button>

      {/* No-path warning */}
      {state.noPath && (
        <span
          role="status"
          aria-live="polite"
          style={{
            fontSize: "var(--t-meta-size)",
            lineHeight: "var(--t-meta-lh)",
            color: "var(--danger)",
            fontFamily: "var(--font-ui)",
            marginLeft: "var(--s-1)",
          }}
        >
          No path found
        </span>
      )}

      {/* Path length badge */}
      {state.path && state.path.length > 0 && (
        <span
          role="status"
          aria-live="polite"
          style={{
            fontSize: "var(--t-meta-size)",
            lineHeight: "var(--t-meta-lh)",
            color: "var(--text-muted)",
            fontFamily: "var(--font-mono)",
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-sm)",
            padding: "0 var(--s-1)",
            marginLeft: "var(--s-1)",
          }}
        >
          {state.path.length - 1} hop{state.path.length !== 2 ? "s" : ""}
        </span>
      )}

      {/* Reset (×) when path is shown */}
      {(state.path || state.noPath) && (
        <button
          aria-label="Clear path"
          onClick={onReset}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--text-faint)",
            fontSize: 14,
            lineHeight: 1,
            padding: "0 0 0 var(--s-1)",
            outline: "none",
          }}
          onFocus={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "0 0 0 2px var(--accent)"; }}
          onBlur={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}
        >
          ×
        </button>
      )}
    </div>
  );
}

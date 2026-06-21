/**
 * TourBar — dependency-ordered tour scaffold.
 *
 * Walks the camera through the current view's nodes in a deterministic order
 * (highest fan-in first — most-depended-on nodes lead the tour, matching
 * the "entrypoint → leaf" reading order engineers naturally want).
 *
 * Per-step PROSE is Phase 3 (LLM brain). For now shows node's existing
 * metadata: name, layer, sym count, in/out.
 *
 * Uses React Flow's useReactFlow() hook to pan/zoom to each node
 * (fitBounds on the node's measured bounding box). Must be rendered
 * inside <ReactFlow> provider context.
 *
 * Research:
 *   - Graph traversal ordering: fan-in as importance proxy (Gamma et al. patterns)
 *   - VS Code walkthrough UX: numbered steps, next/prev, step counter
 *   - React Flow fitBounds / setCenter API for programmatic camera control
 *   - WCAG 2.2: keyboard-operable (←/→ arrow keys), focus management
 */

import { useState, useCallback, useEffect } from "react";
import { useReactFlow } from "@xyflow/react";
import type { FlowNode } from "../graph/layout";

interface TourBarProps {
  nodes: FlowNode[];
  active: boolean;
  onActivate: () => void;
  onClose: () => void;
}

/** Sort nodes by fan-in descending (most-depended-on first). Tie-break by label. */
function tourOrder(nodes: FlowNode[]): FlowNode[] {
  return [...nodes].sort((a, b) => {
    const aFanIn = (a.data as { fanIn?: number }).fanIn ?? 0;
    const bFanIn = (b.data as { fanIn?: number }).fanIn ?? 0;
    if (bFanIn !== aFanIn) return bFanIn - aFanIn;
    const aLabel = (a.data as { label?: string }).label ?? "";
    const bLabel = (b.data as { label?: string }).label ?? "";
    return aLabel.localeCompare(bLabel);
  });
}

export function TourBar({ nodes, active, onActivate, onClose }: TourBarProps) {
  const rf = useReactFlow();
  const [step, setStep] = useState(0);
  const ordered = tourOrder(nodes);
  const total = ordered.length;
  const current = ordered[step] ?? null;

  // Pan to current node whenever step changes (and tour is active).
  useEffect(() => {
    if (!active || !current) return;
    // fitBounds centers + zooms to the node's bounding box with padding.
    rf.fitBounds(
      {
        x: current.position.x,
        y: current.position.y,
        width: (current.data as { width?: number }).width ?? 200,
        height: (current.data as { height?: number }).height ?? 64,
      },
      { duration: 400, padding: 0.35 },
    );
  }, [active, step, current, rf]);

  // Reset step when tour is re-activated or node set changes.
  useEffect(() => { setStep(0); }, [active, nodes]);

  // Keyboard: ← → to navigate, Escape to close.
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        setStep((s) => Math.min(s + 1, total - 1));
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        setStep((s) => Math.max(s - 1, 0));
      } else if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [active, total, onClose]);

  // Idle state — just show the Tour button.
  if (!active) {
    return (
      <button
        onClick={onActivate}
        aria-label="Start structural tour"
        title="Tour — walk nodes in dependency order (← →)"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--t-meta-size)",
          lineHeight: "var(--t-meta-lh)",
          padding: "var(--s-1) var(--s-3)",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-sm)",
          color: "var(--text-muted)",
          cursor: "pointer",
          outline: "none",
          transition: "color 80ms ease, border-color 80ms ease",
          whiteSpace: "nowrap",
        }}
        onFocus={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "0 0 0 2px var(--accent)"; }}
        onBlur={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--text-muted)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; }}
      >
        ▶ Tour
      </button>
    );
  }

  // Active tour bar.
  const nodeData = current?.data as { label?: string; layer?: string; symbolCount?: number; fanIn?: number; fanOut?: number; complexity?: number } | undefined;

  return (
    <div
      role="region"
      aria-label={`Tour step ${step + 1} of ${total}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--s-3)",
        background: "var(--surface)",
        border: "1px solid var(--accent)",
        borderRadius: "var(--r-md)",
        padding: "var(--s-2) var(--s-3)",
        boxShadow: "0 0 0 1px var(--accent-soft), 0 4px 16px rgba(0,0,0,0.3)",
        maxWidth: 500,
        minWidth: 280,
      }}
    >
      {/* Step counter */}
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--t-meta-size)",
          color: "var(--accent)",
          flexShrink: 0,
          fontWeight: 600,
          minWidth: 48,
        }}
      >
        {step + 1} / {total}
      </span>

      {/* Node info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: "var(--t-label-size)",
            fontWeight: 600,
            color: "var(--text)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontFamily: "var(--font-ui)",
          }}
        >
          {nodeData?.label ?? "—"}
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--t-meta-size)",
            color: "var(--text-muted)",
            marginTop: 1,
          }}
        >
          {nodeData?.layer} · {nodeData?.symbolCount ?? 0} sym · in {nodeData?.fanIn ?? 0} / out {nodeData?.fanOut ?? 0}
        </div>
      </div>

      {/* Prev / Next */}
      <div style={{ display: "flex", gap: "var(--s-1)", flexShrink: 0 }}>
        <NavBtn
          onClick={() => setStep((s) => Math.max(s - 1, 0))}
          disabled={step === 0}
          aria-label="Previous node"
          title="Previous (←)"
        >
          ←
        </NavBtn>
        <NavBtn
          onClick={() => setStep((s) => Math.min(s + 1, total - 1))}
          disabled={step === total - 1}
          aria-label="Next node"
          title="Next (→)"
        >
          →
        </NavBtn>
        <NavBtn onClick={onClose} aria-label="Close tour" title="Close (Esc)">
          ×
        </NavBtn>
      </div>
    </div>
  );
}

function NavBtn({
  onClick, disabled, children, "aria-label": ariaLabel, title,
}: {
  onClick: () => void; disabled?: boolean; children: React.ReactNode;
  "aria-label": string; title: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      title={title}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 14,
        lineHeight: 1,
        width: 26,
        height: 26,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "none",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-sm)",
        color: disabled ? "var(--text-faint)" : "var(--text-muted)",
        cursor: disabled ? "default" : "pointer",
        outline: "none",
        transition: "color 80ms ease, border-color 80ms ease",
        opacity: disabled ? 0.4 : 1,
      }}
      onFocus={(e) => { if (!disabled) (e.currentTarget as HTMLElement).style.boxShadow = "0 0 0 2px var(--accent)"; }}
      onBlur={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}
    >
      {children}
    </button>
  );
}

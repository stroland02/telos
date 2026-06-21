/**
 * ExportButton — download the current graph as SVG or JSON.
 *
 * Must be rendered inside a ReactFlow provider (uses useReactFlow).
 *
 * SVG export: clones the .react-flow__viewport element, wraps it in an <svg>
 * with the correct viewBox derived from getNodesBounds + getViewportForBounds,
 * inlines the background color, and triggers a download. Zero dependencies.
 *
 * JSON export: serializes the current ReactFlow nodes + edges (with their
 * data/positions) to a pretty-printed JSON file — useful for offline analysis
 * or re-importing into other tools.
 *
 * Research:
 *   - ReactFlow v12 getNodesBounds + getViewportForBounds (official export recipe).
 *   - Understand-Anything "Export / E" feature pattern.
 *   - WCAG: aria-haspopup menu, aria-label on icon buttons.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useReactFlow, getNodesBounds, getViewportForBounds } from "@xyflow/react";
import type { GraphView } from "../api/types";

interface ExportButtonProps {
  /** The raw graph view for JSON export (includes layer/level metadata). */
  graphView: GraphView | null;
}

const IMAGE_WIDTH = 1920;
const IMAGE_HEIGHT = 1080;

function downloadSvg(svgEl: SVGSVGElement, filename: string) {
  const serializer = new XMLSerializer();
  let source = serializer.serializeToString(svgEl);
  // Add XML declaration.
  source = '<?xml version="1.0" encoding="utf-8"?>\n' + source;
  const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExportButton({ graphView }: ExportButtonProps) {
  const { getNodes, getEdges } = useReactFlow();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  const exportSvg = useCallback(() => {
    setOpen(false);
    const nodes = getNodes();
    if (nodes.length === 0) return;

    // Build an SVG from the ReactFlow viewport element.
    const viewportEl = document.querySelector<HTMLElement>(".react-flow__viewport");
    if (!viewportEl) return;

    const bounds = getNodesBounds(nodes);
    const { x, y, zoom } = getViewportForBounds(
      bounds,
      IMAGE_WIDTH,
      IMAGE_HEIGHT,
      0.5,
      2,
      0.1,
    );

    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("xmlns", svgNS);
    svg.setAttribute("width", String(IMAGE_WIDTH));
    svg.setAttribute("height", String(IMAGE_HEIGHT));
    svg.setAttribute("viewBox", `0 0 ${IMAGE_WIDTH} ${IMAGE_HEIGHT}`);

    // Background rect.
    const bg = document.createElementNS(svgNS, "rect");
    bg.setAttribute("width", "100%");
    bg.setAttribute("height", "100%");
    bg.setAttribute("fill", "#0B0F14");
    svg.appendChild(bg);

    // Clone viewport with transform.
    const g = document.createElementNS(svgNS, "g");
    g.setAttribute("transform", `translate(${x},${y}) scale(${zoom})`);

    // Clone the HTML viewport as a foreignObject (preserves React-rendered nodes).
    const fo = document.createElementNS(svgNS, "foreignObject");
    fo.setAttribute("width", "100%");
    fo.setAttribute("height", "100%");
    const clone = viewportEl.cloneNode(true) as HTMLElement;
    clone.style.transform = "none";
    fo.appendChild(clone);
    g.appendChild(fo);
    svg.appendChild(g);

    const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
    downloadSvg(svg as unknown as SVGSVGElement, `telos-graph-${timestamp}.svg`);
  }, [getNodes]);

  const exportJson = useCallback(() => {
    setOpen(false);
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
    const payload = graphView
      ? { nodes: graphView.nodes, edges: graphView.edges, exportedAt: timestamp }
      : { nodes: getNodes(), edges: getEdges(), exportedAt: timestamp };
    downloadJson(payload, `telos-graph-${timestamp}.json`);
  }, [graphView, getNodes, getEdges]);

  const btnBase: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "var(--s-1)",
    width: "100%",
    background: "none",
    border: "none",
    borderRadius: "var(--r-sm)",
    padding: "var(--s-1) var(--s-3)",
    cursor: "pointer",
    fontFamily: "var(--font-ui)",
    fontSize: "var(--t-body-size)",
    lineHeight: "var(--t-body-lh)",
    color: "var(--text-muted)",
    textAlign: "left",
    whiteSpace: "nowrap",
    outline: "none",
  };

  return (
    <div ref={menuRef} style={{ position: "relative", flexShrink: 0 }}>
      {/* Trigger button */}
      <button
        aria-label="Export graph"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          flexShrink: 0,
          background: "none",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-sm)",
          cursor: "pointer",
          color: open ? "var(--text)" : "var(--text-faint)",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--t-meta-size)",
          lineHeight: 1,
          height: 24,
          display: "flex",
          alignItems: "center",
          gap: "var(--s-1)",
          padding: "0 var(--s-2)",
          outline: "none",
          borderColor: open ? "var(--accent)" : "var(--border)",
          transition: "color 80ms ease, border-color 80ms ease",
        }}
        onFocus={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "0 0 0 2px var(--accent)"; }}
        onBlur={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}
      >
        <span aria-hidden="true" style={{ fontSize: 11 }}>↓</span>
        Export
      </button>

      {/* Dropdown menu */}
      {open && (
        <div
          role="menu"
          aria-label="Export options"
          style={{
            position: "absolute",
            top: "calc(100% + var(--s-1))",
            right: 0,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-md)",
            boxShadow: "-2px 4px 16px rgba(0,0,0,.35)",
            overflow: "hidden",
            zIndex: 20,
            minWidth: 140,
          }}
        >
          <button
            role="menuitem"
            onClick={exportSvg}
            style={btnBase}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--surface-2)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "none"; }}
            onFocus={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "inset 0 0 0 2px var(--accent)"; }}
            onBlur={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}
          >
            <span aria-hidden="true" style={{ fontFamily: "var(--font-mono)", fontSize: "var(--t-meta-size)", color: "var(--accent)" }}>SVG</span>
            <span>Download SVG</span>
          </button>
          <div style={{ height: 1, background: "var(--border)", margin: "0 var(--s-2)" }} />
          <button
            role="menuitem"
            onClick={exportJson}
            style={btnBase}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--surface-2)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "none"; }}
            onFocus={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "inset 0 0 0 2px var(--accent)"; }}
            onBlur={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}
          >
            <span aria-hidden="true" style={{ fontFamily: "var(--font-mono)", fontSize: "var(--t-meta-size)", color: "var(--accent)" }}>JSON</span>
            <span>Download JSON</span>
          </button>
        </div>
      )}
    </div>
  );
}

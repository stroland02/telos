/**
 * ShortcutsOverlay — keyboard shortcut cheat-sheet, toggled by pressing "?".
 *
 * Design decisions (WCAG 2.2 + VS Code / GitHub pattern):
 *   - role="dialog" aria-modal="true" aria-label="Keyboard shortcuts".
 *   - Focus is moved to the close button on open; Esc closes.
 *   - Backdrop click also closes.
 *   - Token-styled: --surface panel, --border separator, --accent for key chips.
 *   - Key chips use --font-mono (technical artifact signal from design direction §3).
 *   - No hard-coded hex; no external deps.
 *
 * Research:
 *   - VS Code / GitHub "?" shortcut overlay pattern.
 *   - WCAG 2.2 SC 2.1.1 keyboard; SC 4.1.3 status messages.
 *   - MDN dialog focus management best practices.
 */

import { useEffect, useRef } from "react";

interface Shortcut {
  keys: string[];
  description: string;
}

const SHORTCUTS: { section: string; items: Shortcut[] }[] = [
  {
    section: "Navigation",
    items: [
      { keys: ["Click"], description: "Drill into layer / module / file" },
      { keys: ["⌘K", "Ctrl K"], description: "Open symbol search" },
      { keys: ["Esc"], description: "Close detail panel / cancel" },
    ],
  },
  {
    section: "Graph tools",
    items: [
      { keys: ["⇝ Find path"], description: "Click source then target — BFS shortest path" },
      { keys: ["Hover node"], description: "Highlight connected edges" },
      { keys: ["Layer toggles"], description: "Show / hide layers (bottom-left)" },
    ],
  },
  {
    section: "View",
    items: [
      { keys: ["Scroll"], description: "Zoom in / out" },
      { keys: ["Drag"], description: "Pan the canvas" },
      { keys: ["⊕ / ⊖"], description: "Zoom controls (bottom-left)" },
      { keys: ["⤢"], description: "Fit graph to viewport" },
    ],
  },
  {
    section: "Overlay",
    items: [
      { keys: ["?"], description: "Open / close this shortcuts overlay" },
    ],
  },
];

interface ShortcutsOverlayProps {
  open: boolean;
  onClose: () => void;
}

export function ShortcutsOverlay({ open, onClose }: ShortcutsOverlayProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  // Move focus to close button on open.
  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  // Esc closes.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    /* Backdrop */
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: "rgba(11,15,20,0.72)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Panel — stop propagation so clicks inside don't close */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-lg)",
          boxShadow: "-8px 0 40px rgba(0,0,0,.5), 0 8px 40px rgba(0,0,0,.4)",
          padding: "var(--s-6)",
          width: 420,
          maxWidth: "90vw",
          maxHeight: "80vh",
          overflowY: "auto",
          position: "relative",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "var(--s-4)",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: "var(--t-h-size)",
              lineHeight: "var(--t-h-lh)",
              fontWeight: "var(--t-h-weight)" as React.CSSProperties["fontWeight"],
              color: "var(--text)",
              fontFamily: "var(--font-ui)",
            }}
          >
            Keyboard shortcuts
          </h2>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Close shortcuts overlay"
            style={{
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-sm)",
              cursor: "pointer",
              color: "var(--text-muted)",
              fontFamily: "var(--font-mono)",
              fontSize: "var(--t-meta-size)",
              lineHeight: "var(--t-meta-lh)",
              padding: "2px var(--s-2)",
              outline: "none",
              transition: "border-color 80ms ease, color 80ms ease",
            }}
            onFocus={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "0 0 0 2px var(--accent)"; }}
            onBlur={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}
          >
            Esc
          </button>
        </div>

        {/* Sections */}
        {SHORTCUTS.map((section, si) => (
          <div key={section.section} style={{ marginTop: si > 0 ? "var(--s-4)" : 0 }}>
            {/* Section heading */}
            <div
              style={{
                fontSize: "var(--t-meta-size)",
                lineHeight: "var(--t-meta-lh)",
                fontWeight: 600,
                color: "var(--text-faint)",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                marginBottom: "var(--s-2)",
                fontFamily: "var(--font-ui)",
              }}
            >
              {section.section}
            </div>

            {/* Rows */}
            {section.items.map((item) => (
              <div
                key={item.description}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "var(--s-4)",
                  padding: "var(--s-1) 0",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                {/* Key chips */}
                <div style={{ display: "flex", gap: "var(--s-1)", flexShrink: 0 }}>
                  {item.keys.map((k) => (
                    <kbd
                      key={k}
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "var(--t-meta-size)",
                        lineHeight: "var(--t-meta-lh)",
                        background: "var(--surface-2)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--r-sm)",
                        padding: "1px var(--s-2)",
                        color: "var(--accent)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {k}
                    </kbd>
                  ))}
                </div>
                {/* Description */}
                <span
                  style={{
                    fontSize: "var(--t-body-size)",
                    lineHeight: "var(--t-body-lh)",
                    color: "var(--text-muted)",
                    fontFamily: "var(--font-ui)",
                    textAlign: "right",
                  }}
                >
                  {item.description}
                </span>
              </div>
            ))}
          </div>
        ))}

        {/* Footer hint */}
        <div
          style={{
            marginTop: "var(--s-4)",
            fontSize: "var(--t-meta-size)",
            lineHeight: "var(--t-meta-lh)",
            color: "var(--text-faint)",
            fontFamily: "var(--font-ui)",
            textAlign: "center",
          }}
        >
          Press <kbd style={{ fontFamily: "var(--font-mono)", color: "var(--accent)", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: "0 4px" }}>?</kbd> to toggle
        </div>
      </div>
    </div>
  );
}

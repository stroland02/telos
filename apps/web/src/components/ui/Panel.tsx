/**
 * Panel — the shared animated modal shell for every Telos overlay (Harness,
 * Ask, Context, Process, Resolutions, Shortcuts…).
 *
 * Owns the things every panel duplicated by hand: the dimmed backdrop, the
 * centered surface card, Escape-to-close, backdrop-click-to-close, focus on
 * open, and now a consistent framer-motion enter/exit. Callers provide the
 * header + body as children, exactly as before — adoption is just swapping the
 * outer two <div>s for <Panel>. Renders nothing when `open` is false.
 */
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { backdropVariants, cardVariants, instant } from "./motion";

export function Panel({
  open, onClose, ariaLabel, children, width = 560, initialFocus, paddingTop = "12vh",
}: {
  open: boolean;
  onClose: () => void;
  ariaLabel: string;
  children: ReactNode;
  width?: number;
  initialFocus?: RefObject<HTMLElement>;
  paddingTop?: string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    (initialFocus?.current ?? cardRef.current)?.focus();
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose, initialFocus]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          variants={reduce ? instant : backdropVariants}
          initial="hidden" animate="visible" exit="exit"
          onClick={onClose}
          style={{
            position: "absolute", inset: 0, zIndex: 40,
            background: "color-mix(in srgb, var(--bg) 70%, transparent)",
            display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop,
          }}
        >
          <motion.div
            ref={cardRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            variants={reduce ? instant : cardVariants}
            onClick={(e) => e.stopPropagation()}
            style={{
              width, maxWidth: "92vw", maxHeight: "72vh", display: "flex", flexDirection: "column",
              background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-md)",
              boxShadow: "var(--elev-2)", overflow: "hidden", outline: "none",
            }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * SignalHint — instructive empty state for the live-signal overlays.
 *
 * The trace / hot-path overlays are backed by real ingestion (OTLP spans,
 * folded-stack profiles), so with no app feeding them they simply render
 * nothing — which reads as "broken". This non-intrusive map hint explains how
 * to light them up, so an empty overlay teaches instead of confusing. Animated
 * with the shared motion system; auto-hidden once data arrives.
 */
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

export interface SignalHintItem { label: string; how: string }

export function SignalHint({ items }: { items: SignalHintItem[] }) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence>
      {items.length > 0 && (
        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          role="status"
          style={{
            position: "absolute", bottom: "var(--s-4)", left: "50%", transform: "translateX(-50%)",
            zIndex: 5, maxWidth: "min(560px, 90%)", display: "flex", flexDirection: "column", gap: "var(--s-1)",
            background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-md)",
            boxShadow: "var(--elev-1)", padding: "var(--s-2) var(--s-3)",
            fontFamily: "var(--font-ui)", fontSize: "var(--t-meta-size)", color: "var(--text-muted)",
          }}
        >
          {items.map((it) => (
            <div key={it.label} style={{ display: "flex", alignItems: "baseline", gap: "var(--s-2)" }}>
              <span style={{ color: "var(--accent)", flexShrink: 0 }}>{it.label}</span>
              <span>
                no data yet — <code style={{ fontFamily: "var(--font-mono)", color: "var(--text)" }}>{it.how}</code>
              </span>
            </div>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

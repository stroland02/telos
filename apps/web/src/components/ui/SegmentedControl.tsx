/**
 * SegmentedControl — a token-styled segmented toggle with a framer-motion
 * sliding active pill (shared layout animation). Replaces the hand-rolled
 * button groups (density overview/learn/deep, Files/+Symbols) that each
 * reimplemented borders + active colors inline.
 *
 * Generic over the option value so callers stay type-safe.
 */
import { motion, useReducedMotion } from "framer-motion";
import { spring } from "./motion";

export interface SegOption<T extends string> { value: T; label: string; title?: string }

export function SegmentedControl<T extends string>({
  options, value, onChange, ariaLabel, mono = true, idBase,
}: {
  options: SegOption<T>[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
  mono?: boolean;
  idBase: string; // unique layoutId namespace so multiple controls don't share the pill
}) {
  const reduce = useReducedMotion();
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      style={{
        display: "flex", position: "relative", gap: 2, padding: 2,
        background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)",
      }}
    >
      {options.map((o) => {
        const selected = value === o.value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            aria-pressed={selected}
            title={o.title}
            style={{
              position: "relative", flex: 1, cursor: "pointer", padding: "3px 0",
              fontFamily: mono ? "var(--font-mono)" : "var(--font-ui)", fontSize: 11, whiteSpace: "nowrap",
              textTransform: "capitalize", background: "none", border: "none", borderRadius: "calc(var(--r-sm) - 2px)",
              color: selected ? "var(--accent)" : "var(--text-faint)", outline: "none",
            }}
            onFocus={(e) => { e.currentTarget.style.boxShadow = "var(--focus-ring)"; }}
            onBlur={(e) => { e.currentTarget.style.boxShadow = "none"; }}
          >
            {selected && (
              <motion.span
                layoutId={`${idBase}-seg-active`}
                transition={reduce ? { duration: 0 } : spring}
                style={{
                  position: "absolute", inset: 0, zIndex: 0, borderRadius: "calc(var(--r-sm) - 2px)",
                  background: "var(--accent-soft)", border: "1px solid var(--accent)",
                }}
              />
            )}
            <span style={{ position: "relative", zIndex: 1 }}>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

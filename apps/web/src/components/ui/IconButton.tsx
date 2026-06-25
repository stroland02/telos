/**
 * IconButton — square, icon-only control (rail header, panel close/refresh,
 * theme/shortcuts). Standardizes the compact 24px control with a consistent
 * hover surface and focus ring.
 */
import { forwardRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { HTMLMotionProps } from "framer-motion";
import { spring } from "./motion";

export const IconButton = forwardRef<HTMLButtonElement, HTMLMotionProps<"button">>(
  function IconButton({ style, ...rest }, ref) {
    const reduce = useReducedMotion();
    return (
      <motion.button
        ref={ref}
        whileHover={reduce ? undefined : { scale: 1.06, backgroundColor: "var(--hover)" }}
        whileTap={reduce ? undefined : { scale: 0.92 }}
        transition={spring}
        style={{
          flexShrink: 0, cursor: "pointer", borderRadius: "var(--r-sm)",
          height: "var(--ctl-h-sm)", minWidth: "var(--ctl-h-sm)", padding: "0 6px",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          background: "none", border: "1px solid var(--border)", color: "var(--text-muted)", outline: "none",
          ...style,
        }}
        {...rest}
        onFocus={(e) => { e.currentTarget.style.boxShadow = "var(--focus-ring)"; rest.onFocus?.(e); }}
        onBlur={(e) => { e.currentTarget.style.boxShadow = "none"; rest.onBlur?.(e); }}
      />
    );
  },
);

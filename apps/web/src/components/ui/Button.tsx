/**
 * Button — one button to replace the per-panel `btn()` helpers that drifted
 * (heights 24 vs 28px, ad-hoc padding/colors). Token-driven, consistent
 * focus-visible ring, subtle framer-motion press. Variants cover the cases the
 * app actually uses: primary (accent), default (outlined), ghost (bare),
 * danger.
 */
import { forwardRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { HTMLMotionProps } from "framer-motion";
import { spring } from "./motion";

type Variant = "primary" | "default" | "ghost" | "danger";
type Size = "sm" | "md";

const palette: Record<Variant, { bg: string; border: string; color: string }> = {
  primary: { bg: "var(--accent-soft)", border: "var(--accent)", color: "var(--accent)" },
  default: { bg: "transparent", border: "var(--border)", color: "var(--text-muted)" },
  ghost: { bg: "transparent", border: "transparent", color: "var(--text-muted)" },
  danger: { bg: "var(--danger-soft)", border: "var(--danger)", color: "var(--danger)" },
};

export interface ButtonProps extends HTMLMotionProps<"button"> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "default", size = "md", style, ...rest }, ref,
) {
  const reduce = useReducedMotion();
  const p = palette[variant];
  return (
    <motion.button
      ref={ref}
      whileHover={reduce ? undefined : { scale: 1.02 }}
      whileTap={reduce ? undefined : { scale: 0.97 }}
      transition={spring}
      style={{
        flexShrink: 0, cursor: "pointer", borderRadius: "var(--r-sm)",
        height: size === "sm" ? "var(--ctl-h-sm)" : "var(--ctl-h)",
        padding: size === "sm" ? "0 var(--s-2)" : "0 var(--s-3)",
        fontFamily: "var(--font-ui)", fontSize: "var(--t-meta-size)",
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "var(--s-1)",
        background: p.bg, border: `1px solid ${p.border}`, color: p.color, outline: "none",
        ...style,
      }}
      {...rest}
      onFocus={(e) => { e.currentTarget.style.boxShadow = "var(--focus-ring)"; rest.onFocus?.(e); }}
      onBlur={(e) => { e.currentTarget.style.boxShadow = "none"; rest.onBlur?.(e); }}
    />
  );
});

/**
 * Shared framer-motion config for Telos UI primitives.
 *
 * Centralizes the spring/timing feel so every panel, button and control moves
 * the same way. All variants degrade gracefully under prefers-reduced-motion:
 * components pass `reduce` (from framer-motion's useReducedMotion) and we swap
 * spring transitions for instant ones — the global CSS guard in tokens.css also
 * kills CSS transitions, so motion is fully opt-out for accessibility.
 */
import type { Transition, Variants } from "framer-motion";

/** Snappy, slightly springy — the house feel for press/enter interactions. */
export const spring: Transition = { type: "spring", stiffness: 420, damping: 32, mass: 0.7 };

/** A quick tween for hover/opacity changes where spring would feel floaty. */
export const tween: Transition = { duration: 0.16, ease: [0.22, 1, 0.36, 1] };

/** Backdrop fade for modal overlays. */
export const backdropVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: tween },
  exit: { opacity: 0, transition: { duration: 0.12 } },
};

/** Modal card: subtle scale + lift in, reverse out. */
export const cardVariants: Variants = {
  hidden: { opacity: 0, scale: 0.97, y: 8 },
  visible: { opacity: 1, scale: 1, y: 0, transition: spring },
  exit: { opacity: 0, scale: 0.98, y: 6, transition: { duration: 0.12 } },
};

/** Press/hover feedback for interactive elements (used via whileHover/whileTap). */
export const pressable = {
  whileHover: { scale: 1.015 },
  whileTap: { scale: 0.97 },
  transition: spring,
} as const;

/** Reduced-motion variants: appear/disappear instantly, no transform. */
export const instant: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0 } },
  exit: { opacity: 0, transition: { duration: 0 } },
};

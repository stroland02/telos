/**
 * Badge — a small status chip (counts, "on/off", severities). Tone maps to the
 * semantic token palette so callers don't hand-pick colors.
 */
import type { ReactNode } from "react";

type Tone = "neutral" | "accent" | "ok" | "warn" | "danger";

const tones: Record<Tone, { bg: string; color: string; border: string }> = {
  neutral: { bg: "var(--surface-2)", color: "var(--text-muted)", border: "var(--border)" },
  accent: { bg: "var(--accent-soft)", color: "var(--accent)", border: "var(--accent)" },
  ok: { bg: "var(--complexity-simple-bg)", color: "var(--complexity-simple)", border: "var(--complexity-simple)" },
  warn: { bg: "var(--complexity-moderate-bg)", color: "var(--complexity-moderate)", border: "var(--complexity-moderate)" },
  danger: { bg: "var(--danger-soft)", color: "var(--danger)", border: "var(--danger)" },
};

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  const t = tones[tone];
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 4, padding: "1px 7px",
        borderRadius: 999, fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: "16px",
        background: t.bg, color: t.color, border: `1px solid ${t.border}`,
      }}
    >
      {children}
    </span>
  );
}

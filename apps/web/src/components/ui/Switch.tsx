/** Switch — accessible on/off toggle. Token-styled, no hard-coded hex. */
export function Switch({
  checked, onChange, label,
}: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        cursor: "pointer", background: "none", border: "none", padding: 0,
        fontFamily: "var(--font-ui)", fontSize: "var(--t-meta-size)", color: "var(--text)",
        outline: "none",
      }}
      onFocus={(e) => { e.currentTarget.style.boxShadow = "var(--focus-ring)"; }}
      onBlur={(e) => { e.currentTarget.style.boxShadow = "none"; }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 34, height: 18, borderRadius: 999, position: "relative", flexShrink: 0,
          background: checked ? "var(--accent)" : "var(--border)",
          transition: "background 120ms ease",
        }}
      >
        <span style={{
          position: "absolute", top: 2, left: checked ? 18 : 2, width: 14, height: 14,
          borderRadius: 999, background: "var(--surface)", transition: "left 120ms ease",
        }} />
      </span>
      <span>{checked ? "on" : "off"}</span>
    </button>
  );
}

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

// State of harness engagement for a repo.
export interface ActivationState {
  settingsPath: string;
  statusLinePresent: boolean;
  harnessLockPresent: boolean;
}

// Substring that marks a statusLine as ours (so deactivate only removes Telos's).
const TELOS_MARKER = "status --line";

/** The one-line indicator Claude Code's statusline renders. */
export function statusLineText(s: { agents?: number; graph?: boolean; live?: boolean }): string {
  if (s.agents == null) return "◇ Telos";
  const parts = ["◇ Telos engaged", `${s.agents} agents`, `graph ${s.graph ? "✓" : "—"}`];
  if (s.live) parts.push("live");
  return parts.join(" · ");
}

function settingsPathFor(repoRoot: string): string {
  return join(repoRoot, ".claude", "settings.json");
}

function readSettings(p: string): Record<string, unknown> {
  if (!existsSync(p)) return {};
  try {
    const data = JSON.parse(readFileSync(p, "utf8"));
    return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function isTelosStatusLine(sl: unknown): boolean {
  return !!(sl && typeof (sl as { command?: unknown }).command === "string" &&
    ((sl as { command: string }).command).includes(TELOS_MARKER));
}

/** Write a `statusLine` into <repo>/.claude/settings.json, preserving other keys. */
export function activate(repoRoot: string, opts: { statusLineCommand?: string } = {}): ActivationState {
  const p = settingsPathFor(repoRoot);
  const settings = readSettings(p);
  const command = opts.statusLineCommand ?? "telos status --line";
  settings.statusLine = { type: "command", command };
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(settings, null, 2) + "\n");
  return activationState(repoRoot);
}

/** Remove only the statusLine Telos added; leave all other settings intact. */
export function deactivate(repoRoot: string): ActivationState {
  const p = settingsPathFor(repoRoot);
  if (existsSync(p)) {
    const settings = readSettings(p);
    if (isTelosStatusLine(settings.statusLine)) {
      delete settings.statusLine;
      writeFileSync(p, JSON.stringify(settings, null, 2) + "\n");
    }
  }
  return activationState(repoRoot);
}

export function activationState(repoRoot: string): ActivationState {
  const p = settingsPathFor(repoRoot);
  const settings = readSettings(p);
  return {
    settingsPath: p,
    statusLinePresent: isTelosStatusLine(settings.statusLine),
    harnessLockPresent: existsSync(join(repoRoot, ".telos", "harness.lock")),
  };
}

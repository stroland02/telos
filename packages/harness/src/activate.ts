import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

// State of harness engagement for a repo.
export interface ActivationState {
  settingsPath: string;
  statusLinePresent: boolean;
  hookPresent: boolean;
  harnessLockPresent: boolean;
}

// Substrings that mark settings as ours (so deactivate only removes Telos's).
const STATUSLINE_MARKER = "status --line";
const HOOK_MARKER = "route --hook";

/** The one-line indicator Claude Code's statusline renders. */
export function statusLineText(s: { agents?: number; graph?: boolean; live?: boolean; harnesses?: number }): string {
  if (s.agents == null) return "◇ Telos";
  const parts = ["◇ Telos engaged"];
  if (s.harnesses != null) parts.push(`${s.harnesses} harness${s.harnesses === 1 ? "" : "es"}`);
  parts.push(`${s.agents} agents`, `graph ${s.graph ? "✓" : "—"}`);
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
    ((sl as { command: string }).command).includes(STATUSLINE_MARKER));
}

function isTelosHookEntry(entry: unknown): boolean {
  const hooks = (entry as { hooks?: unknown }).hooks;
  return Array.isArray(hooks) && hooks.some((h) =>
    typeof (h as { command?: unknown }).command === "string" && (h as { command: string }).command.includes(HOOK_MARKER));
}

function setUserPromptHook(settings: Record<string, unknown>, command: string): void {
  const hooks = (settings.hooks && typeof settings.hooks === "object" ? settings.hooks : {}) as Record<string, unknown>;
  const existing = Array.isArray(hooks.UserPromptSubmit) ? (hooks.UserPromptSubmit as unknown[]).filter((e) => !isTelosHookEntry(e)) : [];
  existing.push({ hooks: [{ type: "command", command }] });
  hooks.UserPromptSubmit = existing;
  settings.hooks = hooks;
}

function removeUserPromptHook(settings: Record<string, unknown>): boolean {
  const hooks = settings.hooks as Record<string, unknown> | undefined;
  if (!hooks || !Array.isArray(hooks.UserPromptSubmit)) return false;
  const list = hooks.UserPromptSubmit as unknown[];
  const filtered = list.filter((e) => !isTelosHookEntry(e));
  if (filtered.length === list.length) return false;
  if (filtered.length === 0) delete hooks.UserPromptSubmit;
  else hooks.UserPromptSubmit = filtered;
  if (Object.keys(hooks).length === 0) delete settings.hooks;
  return true;
}

function hookPresent(settings: Record<string, unknown>): boolean {
  const hooks = settings.hooks as Record<string, unknown> | undefined;
  return !!(hooks && Array.isArray(hooks.UserPromptSubmit) && (hooks.UserPromptSubmit as unknown[]).some(isTelosHookEntry));
}

/** Write BOTH the statusLine and the UserPromptSubmit routing hook into
 *  <repo>/.claude/settings.json, preserving all other keys. The routing hook is
 *  what actually engages Telos on every prompt, so it is installed by default —
 *  pass `hookCommand: null` only for the rare statusline-only case. */
export function activate(repoRoot: string, opts: { statusLineCommand?: string; hookCommand?: string | null } = {}): ActivationState {
  const p = settingsPathFor(repoRoot);
  const settings = readSettings(p);
  settings.statusLine = { type: "command", command: opts.statusLineCommand ?? "telos status --line" };
  const hookCommand = opts.hookCommand === null ? null : (opts.hookCommand ?? "telos route --hook");
  if (hookCommand) setUserPromptHook(settings, hookCommand);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(settings, null, 2) + "\n");
  return activationState(repoRoot);
}

/** Remove only the statusLine + UserPromptSubmit hook Telos added. */
export function deactivate(repoRoot: string): ActivationState {
  const p = settingsPathFor(repoRoot);
  if (existsSync(p)) {
    const settings = readSettings(p);
    let changed = false;
    if (isTelosStatusLine(settings.statusLine)) { delete settings.statusLine; changed = true; }
    if (removeUserPromptHook(settings)) changed = true;
    if (changed) writeFileSync(p, JSON.stringify(settings, null, 2) + "\n");
  }
  return activationState(repoRoot);
}

export function activationState(repoRoot: string): ActivationState {
  const p = settingsPathFor(repoRoot);
  const settings = readSettings(p);
  return {
    settingsPath: p,
    statusLinePresent: isTelosStatusLine(settings.statusLine),
    hookPresent: hookPresent(settings),
    harnessLockPresent: existsSync(join(repoRoot, ".telos", "harness.lock")),
  };
}

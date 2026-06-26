import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { activate, deactivate, activationState, statusLineText } from "./activate.js";

let dir: string;
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

describe("statusLineText", () => {
  it("renders the engaged line, degrading to ◇ Telos", () => {
    expect(statusLineText({ agents: 8, graph: true, live: true })).toBe("◇ Telos engaged · 8 agents · graph ✓ · live");
    expect(statusLineText({ agents: 8, graph: false })).toBe("◇ Telos engaged · 8 agents · graph —");
    expect(statusLineText({})).toBe("◇ Telos");
  });
});

describe("activate / deactivate", () => {
  it("writes a statusLine, preserving pre-existing keys; deactivate removes only it", () => {
    dir = mkdtempSync(join(tmpdir(), "telos-act-"));
    mkdirSync(join(dir, ".claude"));
    writeFileSync(join(dir, ".claude", "settings.json"), JSON.stringify({ model: "opus", permissions: { allow: [] } }, null, 2));

    const st = activate(dir);
    expect(st.statusLinePresent).toBe(true);
    const written = JSON.parse(readFileSync(join(dir, ".claude", "settings.json"), "utf8"));
    expect(written.statusLine).toEqual({ type: "command", command: "telos status --line" });
    expect(written.model).toBe("opus");              // preserved
    expect(written.permissions).toEqual({ allow: [] });

    deactivate(dir);
    const after = JSON.parse(readFileSync(join(dir, ".claude", "settings.json"), "utf8"));
    expect(after.statusLine).toBeUndefined();         // removed
    expect(after.model).toBe("opus");                 // other keys intact
  });

  it("creates the settings file when absent and is idempotent", () => {
    dir = mkdtempSync(join(tmpdir(), "telos-act-"));
    activate(dir);
    activate(dir); // re-activate: still valid, single statusLine
    expect(existsSync(join(dir, ".claude", "settings.json"))).toBe(true);
    expect(activationState(dir).statusLinePresent).toBe(true);
  });

  it("does not remove a non-Telos statusLine", () => {
    dir = mkdtempSync(join(tmpdir(), "telos-act-"));
    mkdirSync(join(dir, ".claude"));
    writeFileSync(join(dir, ".claude", "settings.json"), JSON.stringify({ statusLine: { type: "command", command: "my-prompt" } }));
    deactivate(dir);
    const after = JSON.parse(readFileSync(join(dir, ".claude", "settings.json"), "utf8"));
    expect(after.statusLine).toEqual({ type: "command", command: "my-prompt" });
  });
});

describe("activate UserPromptSubmit hook", () => {
  it("installs the routing hook BY DEFAULT (no opts) — regression: web Activate must engage routing", () => {
    dir = mkdtempSync(join(tmpdir(), "telos-act-default-"));
    const st = activate(dir); // no hookCommand — must still install the hook
    expect(st.statusLinePresent).toBe(true);
    expect(st.hookPresent).toBe(true);
    const w = JSON.parse(readFileSync(join(dir, ".claude", "settings.json"), "utf8"));
    expect(w.hooks.UserPromptSubmit[0].hooks[0].command).toBe("telos route --hook");
  });

  it("can be told to skip the hook with hookCommand: null", () => {
    const d = mkdtempSync(join(tmpdir(), "telos-act-nohook-"));
    try {
      const st = activate(d, { hookCommand: null });
      expect(st.statusLinePresent).toBe(true);
      expect(st.hookPresent).toBe(false);
    } finally { rmSync(d, { recursive: true, force: true }); }
  });

  it("installs the routing hook, preserving other hooks; deactivate removes only ours", () => {
    const d = mkdtempSync(join(tmpdir(), "telos-hook-"));
    try {
      mkdirSync(join(d, ".claude"));
      writeFileSync(join(d, ".claude", "settings.json"), JSON.stringify({ hooks: { PreToolUse: [{ hooks: [{ type: "command", command: "other-hook" }] }] } }));
      const st = activate(d, { hookCommand: 'node x.js route --hook' });
      expect(st.hookPresent).toBe(true);
      const w = JSON.parse(readFileSync(join(d, ".claude", "settings.json"), "utf8"));
      expect(w.hooks.PreToolUse).toBeDefined();
      expect(w.hooks.UserPromptSubmit[0].hooks[0].command).toContain("route --hook");
      deactivate(d);
      const a = JSON.parse(readFileSync(join(d, ".claude", "settings.json"), "utf8"));
      expect(a.hooks?.UserPromptSubmit).toBeUndefined();
      expect(a.hooks.PreToolUse).toBeDefined();
    } finally { rmSync(d, { recursive: true, force: true }); }
  });
});

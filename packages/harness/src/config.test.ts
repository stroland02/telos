import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readConfig, writeConfig, setEnabled } from "./config.js";

let dir: string;
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

describe("harness config", () => {
  it("defaults to no enabled harnesses", () => {
    dir = mkdtempSync(join(tmpdir(), "telos-hc-"));
    expect(readConfig(dir)).toEqual({ enabled: [] });
  });

  it("round-trips writeConfig/readConfig", () => {
    dir = mkdtempSync(join(tmpdir(), "telos-hc-"));
    writeConfig(dir, { enabled: ["ecc", "superpowers"] });
    expect(readConfig(dir).enabled.sort()).toEqual(["ecc", "superpowers"]);
  });

  it("setEnabled toggles a harness and dedupes", () => {
    dir = mkdtempSync(join(tmpdir(), "telos-hc-"));
    expect(setEnabled(dir, "ecc", true).enabled).toEqual(["ecc"]);
    setEnabled(dir, "ecc", true); // idempotent
    expect(setEnabled(dir, "headroom", true).enabled.sort()).toEqual(["ecc", "headroom"]);
    expect(setEnabled(dir, "ecc", false).enabled).toEqual(["headroom"]);
  });

  it("ignores unknown sources in a malformed file", () => {
    dir = mkdtempSync(join(tmpdir(), "telos-hc-"));
    writeConfig(dir, { enabled: ["ecc", "bogus" as never] });
    expect(readConfig(dir).enabled).toEqual(["ecc"]);
  });

  // ── Phase 3: tunable full-roster routing threshold ───────────────────────
  it("omits routing tunables by default (code default applies)", () => {
    dir = mkdtempSync(join(tmpdir(), "telos-hc-"));
    writeConfig(dir, { enabled: ["ecc"] });
    const c = readConfig(dir);
    expect(c.specialistMin).toBeUndefined();
    expect(c.specialistLimit).toBeUndefined();
  });

  it("round-trips specialistMin/specialistLimit", () => {
    dir = mkdtempSync(join(tmpdir(), "telos-hc-"));
    writeConfig(dir, { enabled: ["ecc"], specialistMin: 0.42, specialistLimit: 5 });
    const c = readConfig(dir);
    expect(c.specialistMin).toBe(0.42);
    expect(c.specialistLimit).toBe(5);
  });

  it("clamps an out-of-range threshold into [0,1] and limit into [1,12]", () => {
    dir = mkdtempSync(join(tmpdir(), "telos-hc-"));
    writeConfig(dir, { enabled: ["ecc"], specialistMin: 5, specialistLimit: 999 });
    const c = readConfig(dir);
    expect(c.specialistMin).toBe(1);
    expect(c.specialistLimit).toBe(12);
  });

  it("rounds a fractional limit and floors a negative min", () => {
    dir = mkdtempSync(join(tmpdir(), "telos-hc-"));
    writeConfig(dir, { enabled: ["ecc"], specialistMin: -0.3, specialistLimit: 2.7 });
    const c = readConfig(dir);
    expect(c.specialistMin).toBe(0);
    expect(c.specialistLimit).toBe(3);
  });

  it("setEnabled preserves the routing tunables", () => {
    dir = mkdtempSync(join(tmpdir(), "telos-hc-"));
    writeConfig(dir, { enabled: ["ecc"], specialistMin: 0.35, specialistLimit: 4 });
    const c = setEnabled(dir, "superpowers", true);
    expect(c.enabled.sort()).toEqual(["ecc", "superpowers"]);
    expect(c.specialistMin).toBe(0.35);
    expect(c.specialistLimit).toBe(4);
  });

  it("ignores a non-numeric threshold without dropping enabled sources", () => {
    dir = mkdtempSync(join(tmpdir(), "telos-hc-"));
    // hand-write a malformed tunable
    writeConfig(dir, { enabled: ["ecc"] });
    const p = join(dir, ".telos", "harness.config.json");
    writeFileSync(p, JSON.stringify({ enabled: ["ecc"], specialistMin: "high" }));
    const c = readConfig(dir);
    expect(c.enabled).toEqual(["ecc"]);
    expect(c.specialistMin).toBeUndefined();
  });
});

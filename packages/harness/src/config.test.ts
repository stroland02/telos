import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
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
});

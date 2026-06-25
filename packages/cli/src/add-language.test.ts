import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addLanguage } from "./add-language.js";

let dir: string;
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

describe("addLanguage", () => {
  it("scaffolds a discoverable language folder (manifest + scm + hints)", () => {
    dir = mkdtempSync(join(tmpdir(), "telos-addlang-"));
    const res = addLanguage({ id: "ruby", extensions: [".rb"], dir });
    const manifest = JSON.parse(readFileSync(join(dir, "ruby", "lang.json"), "utf8"));
    expect(manifest).toEqual({ id: "ruby", extensions: [".rb"], grammar: "tree-sitter-ruby.wasm" });
    expect(existsSync(join(dir, "ruby", "extract.scm"))).toBe(true);
    expect(existsSync(join(dir, "ruby", "layer-hints.json"))).toBe(true);
    expect(res.created).toHaveLength(3);
  });

  it("honors an explicit --grammar", () => {
    dir = mkdtempSync(join(tmpdir(), "telos-addlang-"));
    addLanguage({ id: "cpp", extensions: [".cc", ".hpp"], grammar: "tree-sitter-cpp.wasm", dir });
    const manifest = JSON.parse(readFileSync(join(dir, "cpp", "lang.json"), "utf8"));
    expect(manifest.grammar).toBe("tree-sitter-cpp.wasm");
    expect(manifest.extensions).toEqual([".cc", ".hpp"]);
  });

  it("refuses to clobber an existing folder", () => {
    dir = mkdtempSync(join(tmpdir(), "telos-addlang-"));
    addLanguage({ id: "ruby", extensions: [".rb"], dir });
    expect(() => addLanguage({ id: "ruby", extensions: [".rb"], dir })).toThrow(/already exists/);
  });

  it("omits extract.scm and layer-hints for an aliased language", () => {
    dir = mkdtempSync(join(tmpdir(), "telos-addlang-"));
    const res = addLanguage({ id: "flow", extensions: [".flow"], aliasOf: "typescript", dir });
    expect(existsSync(join(dir, "flow", "extract.scm"))).toBe(false);
    expect(existsSync(join(dir, "flow", "layer-hints.json"))).toBe(false);
    expect(res.created).toHaveLength(1);
    const manifest = JSON.parse(readFileSync(join(dir, "flow", "lang.json"), "utf8"));
    expect(manifest.aliasOf).toBe("typescript");
  });
});

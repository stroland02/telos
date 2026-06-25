import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  discoverLanguages,
  EXTENSION_LANGUAGE,
  LANGUAGE_GRAMMAR,
  extractQueryPath,
} from "./registry.js";

describe("language discovery (shipped manifests)", () => {
  it("discovers the three shipped languages", () => {
    const ids = discoverLanguages().map((m) => m.id).sort();
    expect(ids).toEqual(["javascript", "python", "typescript"]);
  });

  it("builds the extension → language map from manifests", () => {
    expect(EXTENSION_LANGUAGE[".tsx"]).toBe("typescript");
    expect(EXTENSION_LANGUAGE[".js"]).toBe("javascript");
    expect(EXTENSION_LANGUAGE[".py"]).toBe("python");
  });

  it("builds the language → grammar map from manifests", () => {
    expect(LANGUAGE_GRAMMAR["python"]).toBe("tree-sitter-python.wasm");
    expect(LANGUAGE_GRAMMAR["javascript"]).toBe("tree-sitter-typescript.wasm");
  });

  it("resolves aliasOf for the query path (js → typescript)", () => {
    expect(extractQueryPath("javascript").replace(/\\/g, "/")).toMatch(
      /languages\/typescript\/extract\.scm$/,
    );
    expect(extractQueryPath("python").replace(/\\/g, "/")).toMatch(
      /languages\/python\/extract\.scm$/,
    );
  });
});

describe("discoverLanguages(dir) errors", () => {
  let dir: string;
  afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

  it("skips a folder that has no lang.json", () => {
    dir = mkdtempSync(join(tmpdir(), "telos-langs-"));
    mkdirSync(join(dir, "empty"));
    expect(discoverLanguages(dir)).toEqual([]);
  });

  it("throws with the path on a malformed lang.json", () => {
    dir = mkdtempSync(join(tmpdir(), "telos-langs-"));
    mkdirSync(join(dir, "broken"));
    writeFileSync(join(dir, "broken", "lang.json"), "{ not json");
    expect(() => discoverLanguages(dir)).toThrow(/broken/);
  });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeProductContextCache, readProductContextCache } from "./productContextCache.js";

describe("product-context cache", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "telos-pcc-")); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("round-trips a written context", () => {
    writeProductContextCache(dir, { languages: ["typescript"], layers: ["ui", "api"], changedFiles: [] });
    expect(readProductContextCache(dir)).toEqual({ languages: ["typescript"], layers: ["ui", "api"], changedFiles: [] });
  });

  it("returns null when no cache exists", () => {
    expect(readProductContextCache(dir)).toBeNull();
  });

  it("returns null (never throws) on malformed JSON", () => {
    writeFileSync(join(dir, "product-context.json"), "{not json");
    expect(readProductContextCache(dir)).toBeNull();
  });

  it("coerces missing fields to empty arrays", () => {
    writeFileSync(join(dir, "product-context.json"), JSON.stringify({ languages: ["go"] }));
    expect(readProductContextCache(dir)).toEqual({ languages: ["go"], layers: [], changedFiles: [] });
  });
});

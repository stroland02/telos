import { describe, it, expect, afterEach } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { assetRoot, grammarsDir, languagesDir, webDistDir } from "./assets.js";

const ORIG = process.env.TELOS_ASSET_ROOT;
afterEach(() => {
  if (ORIG === undefined) delete process.env.TELOS_ASSET_ROOT;
  else process.env.TELOS_ASSET_ROOT = ORIG;
});

describe("asset resolution", () => {
  it("finds the package root that contains grammars/", () => {
    delete process.env.TELOS_ASSET_ROOT;
    const root = assetRoot();
    expect(existsSync(join(root, "grammars"))).toBe(true);
    expect(grammarsDir()).toBe(join(root, "grammars"));
    expect(languagesDir()).toBe(join(root, "languages"));
  });

  it("honors the TELOS_ASSET_ROOT override for grammars + languages + web", () => {
    process.env.TELOS_ASSET_ROOT = "/custom/telos";
    expect(grammarsDir()).toBe(join("/custom/telos", "grammars"));
    expect(languagesDir()).toBe(join("/custom/telos", "languages"));
    expect(webDistDir()).toBe(join("/custom/telos", "web"));
  });
});

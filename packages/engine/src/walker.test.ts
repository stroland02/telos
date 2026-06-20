import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { detectLanguage, walk } from "./walker.js";

const here = dirname(fileURLToPath(import.meta.url));
const sample = resolve(here, "../fixtures/walker-sample");

describe("detectLanguage", () => {
  it("maps known extensions", () => {
    expect(detectLanguage("x.ts")).toBe("typescript");
    expect(detectLanguage("x.py")).toBe("python");
  });
  it("returns null for unknown extensions", () => {
    expect(detectLanguage("x.log")).toBeNull();
  });
});

describe("walk", () => {
  it("finds source files and honors .gitignore", async () => {
    const files = await walk(sample);
    const names = files.map((f) => f.path.replace(/\\/g, "/").split("/").pop()).sort();
    // ignored.ts is a valid TypeScript file excluded ONLY by the fixture .gitignore;
    // this assertion fails if the `if (ig.ignores(rel)) continue;` line is removed from walker.ts.
    expect(names).toEqual(["a.ts", "b.py"]);
    expect(files.find((f) => f.path.endsWith("a.ts"))?.language).toBe("typescript");
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("@telos/engine package manifest", () => {
  it("declares an exports map and types so consumers resolve deterministically", () => {
    const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
    expect(pkg.exports?.["."]?.import).toBe("./dist/index.js");
    expect(pkg.exports?.["."]?.types).toBe("./dist/index.d.ts");
    expect(pkg.types).toBe("dist/index.d.ts");
  });
});

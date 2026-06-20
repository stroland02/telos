import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { scan } from "./pipeline.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../fixtures/golden");

function summarize(nodes: { kind: string; name: string; language: string }[]) {
  return nodes.map((n) => `${n.language}:${n.kind}:${n.name}`).sort();
}

for (const lang of ["typescript", "python"]) {
  describe(`golden: ${lang}`, () => {
    it("matches the checked-in node summary", async () => {
      const repo = resolve(root, lang);
      rmSync(resolve(repo, ".telos"), { recursive: true, force: true });
      const { graph } = await scan(repo);
      const actual = summarize(graph.nodes);
      const expectedPath = resolve(root, `${lang}.expected.json`);
      if (!existsSync(expectedPath)) writeFileSync(expectedPath, JSON.stringify(actual, null, 2));
      expect(actual).toEqual(JSON.parse(readFileSync(expectedPath, "utf8")));
    });
  });
}

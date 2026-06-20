import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runServe } from "./main.js";

describe("runServe", () => {
  it("rejects with a scan hint when no graph.db exists", async () => {
    const dir = mkdtempSync(join(tmpdir(), "telos-serve-"));
    try {
      await expect(runServe({ path: dir, port: 0 })).rejects.toThrow(/telos scan/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

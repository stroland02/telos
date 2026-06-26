import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverHarnesses } from "./discover.js";

const pluginsDir = join(fileURLToPath(new URL(".", import.meta.url)), "__fixtures__", "plugins");

describe("discoverHarnesses", () => {
  const roster = discoverHarnesses({ pluginsDir });

  it("includes ecc + superpowers as installed with real counts", () => {
    const ecc = roster.sources.find((s) => s.source === "ecc")!;
    expect(ecc.state).toBe("installed");
    expect(ecc.counts.agents).toBeGreaterThanOrEqual(1);
    const sp = roster.sources.find((s) => s.source === "superpowers")!;
    expect(sp.state).toBe("installed");
    expect(sp.counts.skills).toBeGreaterThanOrEqual(1);
  });

  it("surfaces headroom (known default, not installed) as available", () => {
    expect(roster.sources.find((s) => s.source === "headroom")!.state).toBe("available");
  });

  it("includes an unknown installed plugin under its own source", () => {
    expect(roster.sources.some((s) => s.source === "foo")).toBe(true);
    expect(roster.capabilities.some((c) => c.id === "foo:helper")).toBe(true);
  });

  it("ids and derives triggers for each capability", () => {
    expect(roster.capabilities.some((c) => c.id === "ecc:architect")).toBe(true);
    expect(roster.capabilities.some((c) => c.id === "superpowers:brainstorming")).toBe(true);
    expect(roster.capabilities.every((c) => Array.isArray(c.triggers) && c.triggers.length > 0)).toBe(true);
  });

  it("never throws on a missing plugins dir", () => {
    const empty = discoverHarnesses({ pluginsDir: join(pluginsDir, "does-not-exist") });
    expect(empty.capabilities).toEqual([]);
    // known defaults still appear as available
    expect(empty.sources.find((s) => s.source === "ecc")!.state).toBe("available");
  });
});

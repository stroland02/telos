import { describe, it, expect } from "vitest";
import { buildHarnessStatus } from "./status.js";
import { Capability } from "./capability.js";
import { PromptCapability } from "./router.js";
import { HarnessInstall } from "./setup.js";

const nodeCatalog: Capability[] = [
  { id: "ecc:a", kind: "agent", source: "ecc", title: "A", match: { layers: ["api"] } },
  { id: "ecc:b", kind: "agent", source: "ecc", title: "B", match: { layers: ["data"] } },
  { id: "sp:c", kind: "skill", source: "superpowers", title: "C", match: { layers: ["ui"] } },
];
const promptCatalog: PromptCapability[] = [
  { id: "ecc:perf", kind: "agent", source: "ecc", title: "Optimize", triggers: ["optimize", "slow"] },
];
const installs: HarnessInstall[] = [
  { source: "ecc", title: "ECC", repo: "r1", license: "MIT", install: [] },
  { source: "superpowers", title: "SP", repo: "r2", license: "MIT", install: [] },
  { source: "headroom", title: "HR", repo: "r3", license: "Apache-2.0", install: [] },
];

describe("buildHarnessStatus", () => {
  it("counts node capabilities per source and totals", () => {
    const s = buildHarnessStatus({ lockPath: "/x/harness.lock", lock: null, nodeCatalog, promptCatalog, installs });
    expect(s.installed.find((i) => i.source === "ecc")!.nodeCapabilities).toBe(2);
    expect(s.installed.find((i) => i.source === "headroom")!.nodeCapabilities).toBe(0);
    expect(s.totals.nodeCapabilities).toBe(3);
    expect(s.lock.present).toBe(false);
    expect(s.drift.status).toBe("ok");
  });

  it("lists the per-harness capability roster (node + prompt) for the details view", () => {
    const s = buildHarnessStatus({ lockPath: "/x/harness.lock", lock: null, nodeCatalog, promptCatalog, installs });
    const ecc = s.installed.find((i) => i.source === "ecc")!;
    // 2 node-context agents + 1 prompt-intent agent, all sourced from ecc.
    expect(ecc.capabilities.map((c) => c.id)).toEqual(["ecc:a", "ecc:b", "ecc:perf"]);
    const node = ecc.capabilities.find((c) => c.id === "ecc:a")!;
    expect(node.activation).toBe("node");
    expect(node.triggers).toBeUndefined();
    const prompt = ecc.capabilities.find((c) => c.id === "ecc:perf")!;
    expect(prompt.activation).toBe("prompt");
    expect(prompt.triggers).toEqual(["optimize", "slow"]);
    // headroom has nothing curated yet → empty roster, not undefined.
    expect(s.installed.find((i) => i.source === "headroom")!.capabilities).toEqual([]);
  });

  it("reports drift when the lock references a removed capability", () => {
    const lock = { version: 1 as const, capabilities: ["ecc:a", "ecc:b", "sp:c", "ecc:gone"] };
    const s = buildHarnessStatus({ lockPath: "/x/harness.lock", lock, nodeCatalog, promptCatalog, installs });
    expect(s.lock.present).toBe(true);
    expect(s.drift.status).toBe("drift");
    expect(s.drift.missing).toContain("ecc:gone");
  });
});

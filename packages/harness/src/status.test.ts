import { describe, it, expect } from "vitest";
import { buildHarnessStatus, buildFunnel } from "./status.js";
import type { UsageStats } from "./activity.js";
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

describe("buildFunnel", () => {
  const status = buildHarnessStatus({ lockPath: "/x/harness.lock", lock: null, nodeCatalog, promptCatalog, installs });
  const usage: UsageStats = {
    windowPrompts: 2,
    agents: [
      { id: "ecc:a", count: 3, lastTs: 30 },
      { id: "ecc:perf", count: 1, lastTs: 20 },
    ],
    sources: [{ source: "ecc", count: 4, lastTs: 30 }],
  };

  it("maps used/curated/installed per source and flags idle enabled harnesses", () => {
    const f = buildFunnel(status, usage, ["ecc", "superpowers"]);
    const ecc = f.rows.find((r) => r.source === "ecc")!;
    expect(ecc.usedRecent).toBe(2); // ecc:a + ecc:perf
    expect(ecc.curated).toBe(3);    // ecc:a, ecc:b, ecc:perf
    expect(ecc.enabled).toBe(true);
    expect(ecc.idle).toBe(false);
    expect(ecc.lastUsedTs).toBe(30);

    const sp = f.rows.find((r) => r.source === "superpowers")!;
    expect(sp.usedRecent).toBe(0);
    expect(sp.enabled).toBe(true);
    expect(sp.idle).toBe(true); // enabled but unused → prune candidate

    const hr = f.rows.find((r) => r.source === "headroom")!;
    expect(hr.enabled).toBe(false);
    expect(hr.idle).toBe(false); // not enabled → not "idle waste"
  });

  it("totals distinct used agents and the curated pool", () => {
    const f = buildFunnel(status, usage, ["ecc"]);
    expect(f.totals.usedAgents).toBe(2);
    expect(f.totals.curated).toBe(4); // 3 ecc + 1 sp curated rows
  });
});

import { describe, it, expect } from "vitest";
import { buildFocusedContextPack, renderFocusedContextPack } from "./contextCompress.js";
import type { TelosGraph, TelosNode } from "@telos/engine";

function n(p: Partial<TelosNode> & { id: string; name: string; path: string }): TelosNode {
  return {
    kind: "function", qualifiedName: p.name, language: "typescript", lineStart: 1, lineEnd: 9,
    layer: "service", fanIn: 0, fanOut: 0, lines: 9, complexity: 1, summary: null, ...p,
  } as TelosNode;
}

const graph: TelosGraph = {
  nodes: [
    n({ id: "1", name: "authenticateUser", path: "src/auth/login.ts", summary: "verifies credentials and issues a session token", fanIn: 8, complexity: 5 }),
    n({ id: "2", name: "parseOtlpTraces", path: "src/otlp/traces.ts", summary: "parse OpenTelemetry trace spans", fanIn: 3, complexity: 7 }),
    n({ id: "3", name: "renderButton", path: "src/ui/button.tsx", summary: "render a button component", fanIn: 1 }),
    n({ id: "4", name: "computeInvoiceTotal", path: "src/billing/invoice.ts", summary: "sum line items and tax", fanIn: 2, complexity: 3 }),
  ],
  edges: [],
};

describe("buildFocusedContextPack", () => {
  it("returns the full structural pack when no focus is given", () => {
    const pack = buildFocusedContextPack(graph);
    expect(pack.focus).toBeNull();
    expect(pack.relevant).toEqual([]);
    expect(pack.entryPoints.length).toBeGreaterThan(0); // structural lists kept
  });

  it("compresses to the focus-relevant slice when a focus is given", () => {
    const pack = buildFocusedContextPack(graph, { focus: "where do we authenticate the user and check credentials" });
    expect(pack.focus).toContain("authenticate");
    // generic lists dropped (focused-replace), relevant slice present + on-target
    expect(pack.entryPoints).toEqual([]);
    expect(pack.hotspots).toEqual([]);
    expect(pack.relevant[0]?.id).toBe("1"); // authenticateUser ranked first
  });

  it("keeps the structural header (totals + layers) under focus", () => {
    const pack = buildFocusedContextPack(graph, { focus: "parse otlp traces" });
    expect(pack.totals.nodes).toBe(4);
    expect(pack.layers.length).toBeGreaterThan(0);
  });
});

describe("renderFocusedContextPack", () => {
  it("renders the structural brief with no focus", () => {
    const out = renderFocusedContextPack(buildFocusedContextPack(graph));
    expect(out).toContain("Entry points");
  });

  it("renders a focused brief naming the task and the relevant node", () => {
    const out = renderFocusedContextPack(buildFocusedContextPack(graph, { focus: "authenticate the user credentials" }));
    expect(out).toContain("Relevant to your task: authenticate the user credentials");
    expect(out).toContain("authenticateUser");
    expect(out).not.toContain("Hotspots"); // generic sections dropped
  });
});

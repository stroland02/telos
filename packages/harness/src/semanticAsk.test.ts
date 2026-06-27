import { describe, it, expect } from "vitest";
import { semanticAsk } from "./semanticAsk.js";
import type { TelosGraph, TelosNode } from "@telos/engine";

function node(p: Partial<TelosNode> & { id: string; name: string; path: string }): TelosNode {
  return {
    kind: "function", qualifiedName: p.name, language: "typescript", lineStart: 1, lineEnd: 9,
    layer: "service", fanIn: 0, fanOut: 0, lines: 9, complexity: 1, summary: null, ...p,
  } as TelosNode;
}

const graph: TelosGraph = {
  nodes: [
    node({ id: "1", name: "authenticateUser", path: "src/auth/login.ts", summary: "verifies credentials and issues a session token", fanIn: 8 }),
    node({ id: "2", name: "parseOtlpTraces", path: "src/otlp/traces.ts", summary: "parse OpenTelemetry trace spans", fanIn: 3 }),
    node({ id: "3", name: "renderButton", path: "src/ui/button.tsx", summary: "render a button component", fanIn: 1 }),
    node({ id: "4", name: "computeInvoiceTotal", path: "src/billing/invoice.ts", summary: "sum line items and tax for an invoice", fanIn: 2 }),
  ],
  edges: [],
};

describe("semanticAsk (hybrid code search)", () => {
  it("answers a CONCEPTUAL query with no shared words", () => {
    const a = semanticAsk(graph, "where do we check the user's password and log them in");
    expect(a[0]?.node.id).toBe("1"); // authenticateUser
  });

  it("pinpoints an EXACT identifier query", () => {
    const a = semanticAsk(graph, "find parseOtlpTraces");
    expect(a[0]?.node.id).toBe("2");
  });

  it("matches across camelCase token boundaries", () => {
    const a = semanticAsk(graph, "how is the invoice total computed");
    expect(a[0]?.node.id).toBe("4");
  });

  it("returns nothing for an empty query", () => {
    expect(semanticAsk(graph, "   ")).toEqual([]);
  });

  it("surfaces no STRONG match for an off-topic query (search, not silence)", () => {
    // Search returns best-effort candidates, but an off-topic query must not
    // produce a confident (strong) hit the way a real query does (≥0.4 below).
    const a = semanticAsk(graph, "quantum chromodynamics lagrangian");
    expect(a.every((x) => x.score < 0.4)).toBe(true);
  });

  it("a real query DOES produce a strong top hit (the contrast)", () => {
    expect(semanticAsk(graph, "find parseOtlpTraces")[0].score).toBeGreaterThan(0.4);
    expect(semanticAsk(graph, "where do we check the user password")[0].score).toBeGreaterThan(0.4);
  });
});

import { describe, it, expect } from "vitest";
import { parseOtlpTraces } from "./otlp.js";

const body = {
  resourceSpans: [
    {
      scopeSpans: [
        {
          spans: [
            {
              traceId: "t1", spanId: "s1", name: "auth.authenticate",
              startTimeUnixNano: "1000000", endTimeUnixNano: "16000000", // 15ms
              attributes: [
                { key: "code.namespace", value: { stringValue: "auth" } },
                { key: "code.function", value: { stringValue: "authenticate" } },
              ],
            },
            {
              traceId: "t1", spanId: "s2", parentSpanId: "s1", name: "hashPassword",
              startTimeUnixNano: "2000000", endTimeUnixNano: "5000000", // 3ms
              status: { code: 2 },
              attributes: [{ key: "code.function", value: { stringValue: "hashPassword" } }],
            },
            { name: "no-span-id" }, // malformed → skipped
          ],
        },
      ],
    },
  ],
};

describe("parseOtlpTraces", () => {
  it("normalizes spans and skips malformed ones", () => {
    const spans = parseOtlpTraces(body);
    expect(spans).toHaveLength(2);

    const a = spans.find((s) => s.spanId === "s1")!;
    expect(a.name).toBe("auth.authenticate");
    expect(a.durationMs).toBe(15);
    expect(a.isError).toBe(false);
    expect(a.parentSpanId).toBeUndefined();
    expect(a.attrs["code.namespace"]).toBe("auth");
    expect(a.attrs["code.function"]).toBe("authenticate");

    const b = spans.find((s) => s.spanId === "s2")!;
    expect(b.parentSpanId).toBe("s1");
    expect(b.durationMs).toBe(3);
    expect(b.isError).toBe(true);
  });

  it("returns [] for non-OTLP input", () => {
    expect(parseOtlpTraces({})).toEqual([]);
    expect(parseOtlpTraces(null)).toEqual([]);
    expect(parseOtlpTraces("nope")).toEqual([]);
  });
});

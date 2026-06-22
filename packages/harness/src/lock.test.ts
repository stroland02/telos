import { describe, it, expect } from "vitest";
import { Capability } from "./capability.js";
import { buildLock, serializeLock, parseLock } from "./lock.js";

const cap = (id: string): Capability => ({ id, kind: "agent", source: "ecc", title: id, match: { languages: ["x"] } });

describe("buildLock", () => {
  it("records sorted capability ids", () => {
    const lock = buildLock([cap("ecc:b"), cap("ecc:a")]);
    expect(lock).toEqual({ version: 1, capabilities: ["ecc:a", "ecc:b"] });
  });
});

describe("serialize/parse round-trip", () => {
  it("parses what it serializes", () => {
    const lock = buildLock([cap("ecc:a")]);
    expect(parseLock(serializeLock(lock))).toEqual(lock);
  });
  it("rejects a malformed lock", () => {
    expect(() => parseLock(JSON.stringify({ version: 2, capabilities: [] }))).toThrow(/invalid harness\.lock/);
    expect(() => parseLock(JSON.stringify({ version: 1, capabilities: [1, 2] }))).toThrow(/invalid harness\.lock/);
  });
});

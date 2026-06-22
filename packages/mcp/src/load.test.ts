import { describe, it, expect } from "vitest";
import { loadContext } from "./load.js";

describe("loadContext", () => {
  it("throws a clear error when the db is missing", () => {
    expect(() => loadContext("does/not/exist.db")).toThrow(/graph\.db/i);
  });
});

import { describe, it, expect } from "vitest";
import { mapStop, claudeAgentDriver } from "./claude-driver.js";

describe("mapStop", () => {
  it("maps SDK result subtypes to BuildStop", () => {
    expect(mapStop("success")).toBe("success");
    expect(mapStop("error_max_turns")).toBe("max_turns");
    expect(mapStop("error_max_budget_usd")).toBe("max_budget");
    expect(mapStop("error_during_execution")).toBe("error");
    expect(mapStop("whatever")).toBe("error");
  });
  it("exposes a claude-agent driver", () => {
    expect(claudeAgentDriver.id).toBe("claude-agent");
  });
});

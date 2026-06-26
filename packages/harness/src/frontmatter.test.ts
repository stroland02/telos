import { describe, it, expect } from "vitest";
import { parseFrontmatter, deriveTriggers } from "./frontmatter.js";

describe("parseFrontmatter", () => {
  it("parses name, description, and a tools array", () => {
    const md = `---\nname: architect\ndescription: System design specialist. Use PROACTIVELY when planning.\ntools: ["Read", "Grep"]\n---\nbody`;
    expect(parseFrontmatter(md)).toEqual({
      name: "architect",
      description: "System design specialist. Use PROACTIVELY when planning.",
      tools: ["Read", "Grep"],
    });
  });

  it("returns empty object when no frontmatter", () => {
    expect(parseFrontmatter("no frontmatter here")).toEqual({});
  });

  it("tolerates a missing tools field", () => {
    const md = `---\nname: brainstorming\ndescription: Turn ideas into designs\n---\n`;
    expect(parseFrontmatter(md)).toEqual({ name: "brainstorming", description: "Turn ideas into designs" });
  });
});

describe("deriveTriggers", () => {
  it("extracts salient lowercased terms and drops stopwords", () => {
    const t = deriveTriggers("Security review for authentication and injection vulnerabilities");
    expect(t).toContain("security");
    expect(t).toContain("authentication");
    expect(t).toContain("injection");
    expect(t).not.toContain("and");
    expect(t).not.toContain("for");
  });

  it("dedupes and caps the list", () => {
    const t = deriveTriggers("alpha beta beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi");
    expect(new Set(t).size).toBe(t.length);
    expect(t.length).toBeLessThanOrEqual(12);
  });
});

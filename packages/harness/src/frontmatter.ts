// Minimal frontmatter reader for agent/skill markdown files. We parse only the
// three fields Telos routes on (name, description, tools) so we don't need a YAML
// dependency — the harness package must stay dependency-light for the bundled CLI.

const STOPWORDS = new Set([
  "the", "and", "for", "when", "with", "that", "this", "use", "used", "using",
  "into", "your", "you", "are", "from", "not", "but", "all", "any", "via", "per",
  "its", "has", "have", "will", "can", "code", "review", "reviewer", "specialist",
  "proactively", "must", "should", "after", "before", "over", "such",
]);

/** Read `name`, `description`, and a `tools: ["a","b"]` array from YAML frontmatter. */
export function parseFrontmatter(text: string): { name?: string; description?: string; tools?: string[] } {
  const m = /^---\s*\n([\s\S]*?)\n---/.exec(text);
  if (!m) return {};
  const out: { name?: string; description?: string; tools?: string[] } = {};
  for (const line of m[1].split("\n")) {
    const kv = /^(\w+):\s*(.*)$/.exec(line.trim());
    if (!kv) continue;
    const [, key, raw] = kv;
    if (key === "name") out.name = strip(raw);
    else if (key === "description") out.description = strip(raw);
    else if (key === "tools") {
      const arr = /^\[(.*)\]$/.exec(raw.trim());
      if (arr) out.tools = arr[1].split(",").map((s) => strip(s.trim())).filter(Boolean);
    }
  }
  return out;
}

function strip(s: string): string {
  return s.replace(/^["']|["']$/g, "").trim();
}

/**
 * Pull salient, lowercased terms out of a capability's description so the router
 * has keyword material without anyone hand-typing triggers. Drops stopwords and
 * very short tokens, dedupes, and caps the list so scoring stays cheap.
 */
export function deriveTriggers(description: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of description.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) ?? []) {
    if (STOPWORDS.has(w) || seen.has(w)) continue;
    seen.add(w);
    out.push(w);
    if (out.length >= 12) break;
  }
  return out;
}

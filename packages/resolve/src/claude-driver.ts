import { ReviewDriver, ReviewDriverArgs } from "./driver.js";
import { Finding, Severity } from "./types.js";

// Dynamic-imported via a non-literal specifier so tsc never typechecks against
// the SDK (keeps resolve's build independent of the SDK's peer-dep health).
const SDK_SPECIFIER = "@anthropic-ai/claude-agent-sdk";
interface SdkMessage { type: string; subtype?: string; result?: string }
interface SdkModule { query(opts: { prompt: string; options: Record<string, unknown> }): AsyncIterable<SdkMessage> }

/** Parse the agent's result text into Findings. Extracts the first JSON array;
 *  tolerant of surrounding prose. Never throws — returns [] on any problem. */
export function parseFindings(text: string, node: ReviewDriverArgs["node"], capability: string): Finding[] {
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return [];
  try {
    const arr = JSON.parse(m[0]) as Array<Record<string, unknown>>;
    if (!Array.isArray(arr)) return [];
    return arr.map((f) => {
      const sev = String(f.severity);
      return {
        nodeId: node.id,
        file: node.path,
        severity: (["info", "warn", "error"].includes(sev) ? sev : "warn") as Severity,
        title: String(f.title ?? "Finding"),
        detail: String(f.detail ?? ""),
        suggestion: String(f.suggestion ?? ""),
        agent: capability,
      };
    });
  } catch {
    return [];
  }
}

/** Read-only review driver: runs the Claude agent with Read/Grep/Glob only (no
 *  edits). Any failure (missing SDK, auth, parse) returns [] — never throws. */
export const claudeReviewDriver: ReviewDriver = {
  id: "claude",
  async review({ node, repoDir, capability, signal }: ReviewDriverArgs): Promise<Finding[]> {
    let sdk: SdkModule;
    try {
      sdk = (await import(SDK_SPECIFIER)) as unknown as SdkModule;
    } catch {
      return [];
    }
    const prompt =
      `Review the symbol ${node.qualifiedName} in ${node.path} (lines ${node.lineStart}-${node.lineEnd}). ` +
      `Look for bugs, security issues, and clear improvements. ` +
      `Return ONLY a JSON array of findings: ` +
      `[{"severity":"info|warn|error","title":"short","detail":"what's wrong","suggestion":"how to fix"}]. ` +
      `Return [] if nothing notable.`;
    let result = "";
    try {
      for await (const msg of sdk.query({
        prompt,
        options: {
          cwd: repoDir,
          allowedTools: ["Read", "Grep", "Glob"],
          permissionMode: "default",
          maxTurns: 6,
          abortController: signalToController(signal),
        },
      })) {
        if (msg.type === "result" && msg.subtype === "success") result = msg.result ?? "";
      }
    } catch {
      return [];
    }
    return parseFindings(result, node, capability);
  },
};

function signalToController(signal: AbortSignal): AbortController {
  const c = new AbortController();
  if (signal.aborted) c.abort();
  else signal.addEventListener("abort", () => c.abort(), { once: true });
  return c;
}

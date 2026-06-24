import { BuildDriver, BuildDriverArgs, BuildResult, BuildStop } from "./driver.js";

export function mapStop(subtype: string): BuildStop {
  switch (subtype) {
    case "success": return "success";
    case "error_max_turns": return "max_turns";
    case "error_max_budget_usd": return "max_budget";
    default: return "error";
  }
}

// Minimal shape of the bits of @anthropic-ai/claude-agent-sdk we consume. The
// SDK is dynamically imported via a non-literal specifier so tsc never resolves
// (or typechecks against) its types — keeps the forge build independent of the
// SDK's own peer-dep health, and lets a missing install fail gracefully at run.
interface SdkMessage {
  type: string;
  subtype?: string;
  result?: string;
  total_cost_usd?: number;
}
interface SdkModule {
  query(opts: { prompt: string; options: Record<string, unknown> }): AsyncIterable<SdkMessage>;
}

const SDK_SPECIFIER = "@anthropic-ai/claude-agent-sdk";

/** Default driver: runs the Claude Code agent loop in-process via the Agent SDK.
 *  Edits happen in repoDir (already on the forge branch). Optional: any failure
 *  (missing install, missing auth, SDK error) returns a stop reason with the
 *  cause — it never throws past runForge's branch-restore. */
export const claudeAgentDriver: BuildDriver = {
  id: "claude-agent",
  async run({ intent, repoDir, maxTurns, maxBudgetUsd, signal, onCheckpoint }: BuildDriverArgs): Promise<BuildResult> {
    let sdk: SdkModule;
    try {
      sdk = (await import(SDK_SPECIFIER)) as unknown as SdkModule;
    } catch {
      return { stop: "error", turns: 0, costUsd: 0, message: `${SDK_SPECIFIER} not installed — run \`pnpm add ${SDK_SPECIFIER}\`` };
    }

    let turns = 0;
    let costUsd = 0;
    try {
      for await (const message of sdk.query({
        prompt: intent,
        options: {
          cwd: repoDir,
          allowedTools: ["Read", "Edit", "Write", "Bash", "Glob", "Grep"],
          permissionMode: "acceptEdits",
          maxTurns,
          maxBudgetUsd,
          abortController: signalToController(signal),
        },
      })) {
        if (message.type === "assistant") {
          turns += 1;
          await onCheckpoint({ turn: turns, summary: `turn ${turns}`, costUsd, committed: false });
        }
        if (message.type === "result") {
          costUsd = message.total_cost_usd ?? costUsd;
          const subtype = message.subtype ?? "error";
          return { stop: mapStop(subtype), turns, costUsd, message: subtype === "success" ? (message.result ?? "done") : subtype };
        }
      }
      return { stop: "error", turns, costUsd, message: "agent ended without a result" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { stop: signal.aborted ? "cancelled" : "error", turns, costUsd, message: msg };
    }
  },
};

// The SDK takes an AbortController; bridge our AbortSignal to one.
function signalToController(signal: AbortSignal): AbortController {
  const c = new AbortController();
  if (signal.aborted) c.abort();
  else signal.addEventListener("abort", () => c.abort(), { once: true });
  return c;
}

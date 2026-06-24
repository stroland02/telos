import { writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface BuildCheckpoint { turn: number; summary: string; costUsd: number; committed: boolean }

export interface BuildDriverArgs {
  intent: string;
  repoDir: string;
  branch: string;
  maxTurns: number;
  maxBudgetUsd: number;
  signal: AbortSignal;
  onCheckpoint: (c: BuildCheckpoint) => void | Promise<void>;
}

export type BuildStop = "success" | "max_turns" | "max_budget" | "cancelled" | "error";
export interface BuildResult { stop: BuildStop; turns: number; costUsd: number; message: string }
export interface BuildDriver { readonly id: string; run(args: BuildDriverArgs): Promise<BuildResult> }

/** Deterministic, no-network driver. Writes one real .ts file so the loop's
 *  scan+diff has something to reflect. The seam that makes the loop testable. */
export const stubDriver: BuildDriver = {
  id: "stub",
  async run({ repoDir, onCheckpoint }: BuildDriverArgs): Promise<BuildResult> {
    await writeFile(join(repoDir, "forge_stub.ts"), "export function forgeStub() { return 42; }\n");
    await onCheckpoint({ turn: 1, summary: "stub wrote forge_stub.ts", costUsd: 0, committed: false });
    return { stop: "success", turns: 1, costUsd: 0, message: "stub wrote forge_stub.ts" };
  },
};

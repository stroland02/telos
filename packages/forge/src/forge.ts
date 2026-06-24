import { scanGraph, diffGraphs, GraphDiff } from "@telos/engine";
import type { TelosGraph } from "@telos/engine";
import { BuildCheckpoint, BuildDriver, BuildStop } from "./driver.js";
import { slugify, currentBranch, isClean, createAndCheckout, checkout, commitAll } from "./git.js";

export interface ForgeDiffEvent { checkpoint: BuildCheckpoint; diff: GraphDiff }

export interface ForgeOptions {
  intent: string;
  repoDir: string;
  driver: BuildDriver;
  maxTurns?: number;
  maxBudgetUsd?: number;
  signal?: AbortSignal;
  onDiff?: (e: ForgeDiffEvent) => void | Promise<void>;
}

export interface ForgeRunResult {
  branch: string; baseBranch: string; commits: number;
  turns: number; costUsd: number; stop: BuildStop; message: string;
}

export async function runForge(opts: ForgeOptions): Promise<ForgeRunResult> {
  const { intent, repoDir, driver } = opts;
  if (!(await isClean(repoDir))) {
    throw new Error("working tree not clean — commit or stash changes before running forge");
  }
  const baseBranch = await currentBranch(repoDir);
  const branch = `telos/forge/${slugify(intent)}`;
  const base: TelosGraph = await scanGraph(repoDir);

  await createAndCheckout(repoDir, branch);
  let commits = 0;

  try {
    const result = await driver.run({
      intent, repoDir, branch,
      maxTurns: opts.maxTurns ?? 20,
      maxBudgetUsd: opts.maxBudgetUsd ?? 2,
      signal: opts.signal ?? new AbortController().signal,
      onCheckpoint: async (c) => {
        const committed = await commitAll(repoDir, `forge: turn ${c.turn} — ${c.summary}`);
        if (committed) commits += 1;
        const next = await scanGraph(repoDir);
        const diff = diffGraphs(base, next);
        await opts.onDiff?.({ checkpoint: { ...c, committed }, diff });
      },
    });
    return { branch, baseBranch, commits, turns: result.turns, costUsd: result.costUsd, stop: result.stop, message: result.message };
  } finally {
    await checkout(repoDir, baseBranch); // restore the user's tree no matter what
  }
}

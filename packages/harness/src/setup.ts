import { CapabilitySource } from "./capability.js";

/**
 * Install instructions for an orchestrated harness. Telos does NOT execute these
 * itself (installing plugins is side-effecting and environment-specific); `telos
 * setup` prints them so the developer runs them via their own plugin mechanism.
 * This keeps the harness fusion additive and the installer non-destructive.
 */
export interface HarnessInstall {
  source: CapabilitySource;
  title: string;
  repo: string;
  license: string;
  install: string[]; // commands to run, in order
}

export const HARNESS_INSTALLS: HarnessInstall[] = [
  {
    source: "ecc",
    title: "ECC — agents, skills, reviewers",
    repo: "https://github.com/affaan-m/ECC",
    license: "MIT",
    install: ["/plugin marketplace add https://github.com/affaan-m/ECC", "/plugin install ecc@ecc"],
  },
  {
    source: "superpowers",
    title: "Superpowers — agentic dev methodology",
    repo: "https://github.com/obra/superpowers",
    license: "MIT",
    install: ["/plugin install superpowers@claude-plugins-official"],
  },
  {
    source: "headroom",
    title: "Headroom — context compression",
    repo: "https://github.com/chopratejas/headroom",
    license: "Apache-2.0",
    install: ['pip install "headroom-ai[all]"', "headroom wrap claude"],
  },
];

export function buildSetupPlan(): HarnessInstall[] {
  return HARNESS_INSTALLS;
}

import { useEffect, useState } from "react";
import { TelosApi } from "../api/client";
import { ForgeState } from "../api/types";

/** Subscribe to the Forge build-loop stream and expose the latest state.
 *  Null until the first checkpoint arrives; clears nothing on its own —
 *  the overlay is purely additive (no run ⇒ no rings). */
export function useForgeOverlay(api: Pick<TelosApi, "subscribeForge">): { forge: ForgeState | null } {
  const [forge, setForge] = useState<ForgeState | null>(null);
  useEffect(() => api.subscribeForge(setForge), [api]);
  return { forge };
}

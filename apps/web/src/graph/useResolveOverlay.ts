import { useEffect, useState } from "react";
import { TelosApi } from "../api/client";
import { ResolveState } from "../api/types";

/** Subscribe to the Resolve stream and expose the latest findings state.
 *  Null until the first pass arrives; purely additive (no pass ⇒ no rings). */
export function useResolveOverlay(api: Pick<TelosApi, "subscribeResolve">): { resolve: ResolveState | null } {
  const [resolve, setResolve] = useState<ResolveState | null>(null);
  useEffect(() => api.subscribeResolve(setResolve), [api]);
  return { resolve };
}

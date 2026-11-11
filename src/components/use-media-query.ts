"use client";

import { useSyncExternalStore } from "react";

/** Live `matchMedia` result. `null` until the browser can answer (server render and hydration). */
export function useMediaQuery(query: string): boolean | null {
  return useSyncExternalStore(
    (notify) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", notify);
      return () => m.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => null
  );
}

"use client";

import { useEffect } from "react";
import { markBooted } from "./gsap";

/**
 * Marks the end of the first hydration pass. The timeout fires after Strict Mode's second effect pass too
 * (its cleanup clears the first timer), so dev and production behave the same.
 */
export function MotionBoot() {
  useEffect(() => {
    const t = setTimeout(markBooted, 0);
    return () => clearTimeout(t);
  }, []);
  return null;
}

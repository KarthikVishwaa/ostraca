"use client";

import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";

// Plugins are registered here and only here. This file is a client module, so nothing runs on the server.
if (typeof window !== "undefined") gsap.registerPlugin(useGSAP, ScrollTrigger);

export { gsap, useGSAP, ScrollTrigger };

/** Shared timing so every entrance feels the same (0.25-0.6s, power3.out). */
export const EASE = "power3.out";
export const DUR = { fast: 0.25, base: 0.4, slow: 0.6 } as const;

export const NO_MOTION_QUERY = "(prefers-reduced-motion: no-preference)";

/**
 * True until the first page's hydration commit is finished. Content that is already in the server HTML and
 * already on screen must not hide and fade in again, that would flash. See <MotionBoot />.
 */
let booted = false;
export const isBooting = () => !booted;
export const markBooted = () => {
  booted = true;
};

export function inViewport(el: Element, factor = 1) {
  const r = el.getBoundingClientRect();
  return r.top < window.innerHeight * factor && r.bottom > 0;
}

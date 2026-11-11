"use client";

import { useRef } from "react";
import { EASE, NO_MOTION_QUERY, gsap, isBooting, useGSAP } from "./gsap";

/**
 * Quick fade + 12px rise on every client-side route change (used by app/template.tsx). Content is visible
 * in the HTML and with JS off or slow.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el || isBooting()) return;
      const mm = gsap.matchMedia();
      mm.add(NO_MOTION_QUERY, () => {
        gsap.from(el, { opacity: 0, y: 12, duration: 0.35, ease: EASE, clearProps: "transform,opacity" });
      });
    },
    { scope: ref }
  );

  return <div ref={ref}>{children}</div>;
}

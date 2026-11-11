"use client";

import { useRef } from "react";
import { DUR, EASE, NO_MOTION_QUERY, gsap, useGSAP } from "./gsap";

type CountUpProps = {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
};

/**
 * A number that counts to its value on mount and again whenever the value changes (never when it stays the
 * same).
 */
export function CountUp({ value, decimals = 0, prefix = "", suffix = "", className }: CountUpProps) {
  const text = useRef<HTMLSpanElement>(null);
  const shown = useRef<number | null>(null); // what the screen counted to last
  const fmt = (n: number) => `${prefix}${n.toFixed(decimals)}${suffix}`;

  useGSAP(
    () => {
      const el = text.current;
      if (!el) return;
      const from = shown.current ?? 0;
      const mm = gsap.matchMedia();
      mm.add(NO_MOTION_QUERY, () => {
        if (from === value) {
          el.textContent = fmt(value);
          shown.current = value;
          return;
        }
        const proxy = { n: from };
        // `shown` follows what is actually on screen, so a tween killed by Strict Mode's cleanup
        // restarts from where it was instead of being skipped.
        gsap.to(proxy, {
          n: value,
          duration: DUR.slow,
          ease: EASE,
          onUpdate: () => {
            shown.current = proxy.n;
            el.textContent = fmt(proxy.n);
          },
          onComplete: () => {
            shown.current = value;
            el.textContent = fmt(value);
          },
        });
      });
      // Reduced motion: the React-rendered final value is already on screen.
    },
    { dependencies: [value, decimals, prefix, suffix] }
  );

  return (
    <span className={className}>
      <span ref={text} aria-hidden>
        {fmt(value)}
      </span>
      <span className="sr-only">{fmt(value)}</span>
    </span>
  );
}

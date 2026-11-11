"use client";

import { useRef, type ElementType, type ReactNode } from "react";
import { DUR, EASE, NO_MOTION_QUERY, gsap, inViewport, isBooting, useGSAP } from "./gsap";

type RevealProps = {
  children: ReactNode;
  as?: ElementType;
  className?: string;
  /** Seconds to wait once the element is on screen. */
  delay?: number;
  /** Rise distance in px. */
  y?: number;
};

/**
 * Fades and slides its content in once, when it scrolls into view. Uses an IntersectionObserver instead of
 * scroll maths, so late layout shifts (polled data) cannot strand it.
 */
export function Reveal({ children, as: Tag = "div", className, delay = 0, y = 16 }: RevealProps) {
  const ref = useRef<HTMLElement>(null);
  const done = useRef(false);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el || done.current) return;
      const mm = gsap.matchMedia();
      mm.add(NO_MOTION_QUERY, () => {
        if (isBooting() && inViewport(el)) {
          done.current = true; // already visible in the server HTML: leave it alone
          return;
        }
        gsap.set(el, { opacity: 0, y });
        const io = new IntersectionObserver(
          (entries) => {
            if (!entries.some((e) => e.isIntersecting)) return;
            io.disconnect();
            done.current = true;
            gsap.to(el, { opacity: 1, y: 0, duration: DUR.base, delay, ease: EASE, clearProps: "transform,opacity" });
          },
          { rootMargin: "0px 0px -6% 0px" }
        );
        io.observe(el);
        return () => io.disconnect();
      });
    },
    { scope: ref }
  );

  return (
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  );
}

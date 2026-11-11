"use client";

import { useRef, type ElementType, type ReactNode } from "react";
import { DUR, EASE, NO_MOTION_QUERY, gsap, inViewport, isBooting, useGSAP } from "./gsap";

type StaggerProps = {
  children: ReactNode;
  as?: ElementType;
  className?: string;
  /** Seconds between children. */
  each?: number;
  y?: number;
} & Omit<React.HTMLAttributes<HTMLElement>, "children" | "className">;

/**
 * Children enter one after another. Every child animates exactly once: nodes are remembered, so a poll
 * that re-renders the same list does nothing, and only genuinely new children (new key) animate in.
 */
export function Stagger({ children, as: Tag = "div", className, each = 0.06, y = 14, ...rest }: StaggerProps) {
  const ref = useRef<HTMLElement>(null);
  const seen = useRef(new WeakSet<Element>());

  // No dependency list on purpose: runs after every render, but only acts on children it has not seen.
  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      const fresh = Array.from(el.children).filter((c) => !seen.current.has(c));
      if (!fresh.length) return;
      fresh.forEach((c) => seen.current.add(c));
      const mm = gsap.matchMedia();
      mm.add(NO_MOTION_QUERY, () => {
        if (isBooting() && inViewport(el)) return; // part of the server HTML on first paint
        gsap.from(fresh, {
          opacity: 0,
          y,
          duration: DUR.base,
          ease: EASE,
          stagger: Math.min(each, 0.9 / fresh.length),
          clearProps: "transform,opacity",
        });
      });
    },
    { scope: ref, revertOnUpdate: false }
  );

  return (
    <Tag ref={ref} className={className} {...rest}>
      {children}
    </Tag>
  );
}

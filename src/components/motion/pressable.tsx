"use client";

import { Slot } from "@radix-ui/react-slot";
import { gsap } from "./gsap";

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function press(el: HTMLElement, to: number) {
  if (reduced() || (el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true") return;
  // clearProps must be left out entirely while pressing: GSAP reads `clearProps.split(...)` whenever the key exists,
  // even if its value is undefined, and that threw "Cannot read properties of undefined (reading 'split')".
  const vars: gsap.TweenVars = { scale: to, duration: to < 1 ? 0.1 : 0.2, ease: "power3.out", overwrite: "auto" };
  if (to === 1) vars.clearProps = "transform";
  gsap.to(el, vars);
}

/**
 * Subtle scale-on-press for its single child (button, link, card). No wrapper element is added: the
 * handlers and ref are merged onto the child, so layout is unchanged.
 */
export function Pressable({ children, scale = 0.98 }: { children: React.ReactNode; scale?: number }) {
  return (
    <Slot
      ref={(el: HTMLElement | null) => {
        if (el) return () => gsap.killTweensOf(el); // no tween outlives the element
      }}
      onPointerDown={(e: React.PointerEvent<HTMLElement>) => press(e.currentTarget, scale)}
      onPointerUp={(e: React.PointerEvent<HTMLElement>) => press(e.currentTarget, 1)}
      onPointerLeave={(e: React.PointerEvent<HTMLElement>) => press(e.currentTarget, 1)}
      onPointerCancel={(e: React.PointerEvent<HTMLElement>) => press(e.currentTarget, 1)}
    >
      {children}
    </Slot>
  );
}

"use client";

import { Fragment, useRef } from "react";
import { ArrowRight } from "lucide-react";
import { NO_MOTION_QUERY, ScrollTrigger, gsap, useGSAP } from "@/components/motion/gsap";

const STEPS = [
  ["AI suggests", "reads receipts and voice notes"],
  ["Code verifies", "checks every number"],
  ["You approve", "nothing is sent without you"],
  ["PayPal decides", "on disputes and limitations"],
];

/**
 * Four chips that light up one after another, hold, fade and loop gently. All four are lit in the HTML
 * (and with reduced motion); JavaScript turns the lit layers off right before it starts the loop.
 */
export function SafetyStrip() {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = root.current;
      if (!el) return;
      const mm = gsap.matchMedia();
      mm.add(NO_MOTION_QUERY, () => {
        const lit = Array.from(el.querySelectorAll<HTMLElement>("[data-lit]"));
        gsap.set(lit, { opacity: 0 });
        const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.6, paused: true });
        lit.forEach((l, i) => tl.to(l, { opacity: 1, duration: 0.4, ease: "power2.out" }, i * 0.9));
        tl.to({}, { duration: 1.6 }); // hold: all four lit
        tl.to(lit, { opacity: 0, duration: 0.5, ease: "power2.inOut" });
        const st = ScrollTrigger.create({ trigger: el, onToggle: (self) => (self.isActive ? tl.play() : tl.pause()) });
        return () => {
          st.kill();
          tl.kill();
          gsap.killTweensOf(lit);
          gsap.set(lit, { clearProps: "opacity" });
        };
      });
    },
    { scope: root }
  );

  return (
    <div ref={root} role="list" aria-label="How Ostraca keeps you safe" className="grid grid-cols-2 gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] lg:items-center">
      {STEPS.map(([title, sub], i) => (
        <Fragment key={title}>
          <div role="listitem" className="relative overflow-hidden rounded-lg border bg-card px-4 py-3">
            <span data-lit aria-hidden className="absolute inset-0 rounded-lg border-2 border-primary bg-primary/10" />
            <p className="relative text-sm font-semibold">{title}</p>
            <p className="relative text-xs text-muted-foreground">{sub}</p>
          </div>
          {i < STEPS.length - 1 && <ArrowRight aria-hidden className="hidden size-4 text-muted-foreground lg:block" />}
        </Fragment>
      ))}
    </div>
  );
}

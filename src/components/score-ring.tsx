"use client";

import { useRef } from "react";
import { CountUp } from "@/components/motion/count-up";
import { DUR, EASE, NO_MOTION_QUERY, gsap, useGSAP } from "@/components/motion/gsap";
import { cn } from "@/lib/utils";

const TONE = { ready: "text-success", partial: "text-warning", at_risk: "text-destructive" } as const;

/**
 * Readiness ring. It fills with two rotating half-discs behind a masked hole, so the whole animation is
 * transform-only (no stroke or width animation). The number in the middle counts with <CountUp />.
 */
export function ScoreRing({ score, level, size = 132, className }: { score: number; level: keyof typeof TONE; size?: number; className?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const right = useRef<HTMLDivElement>(null); // left half-disc, sweeps through the right half (0-180 deg)
  const left = useRef<HTMLDivElement>(null); // right half-disc, sweeps through the left half (180-360 deg)
  const shown = useRef(0);
  const target = Math.max(0, Math.min(100, score)) * 3.6;

  useGSAP(
    () => {
      const set = (deg: number) => {
        gsap.set(right.current, { rotation: Math.min(deg, 180) });
        gsap.set(left.current, { rotation: Math.max(deg - 180, 0) });
      };
      const mm = gsap.matchMedia();
      mm.add(
        { motion: NO_MOTION_QUERY },
        (ctx) => {
          if (!ctx.conditions?.motion || shown.current === target) {
            shown.current = target;
            return set(target);
          }
          const proxy = { deg: shown.current };
          gsap.to(proxy, {
            deg: target,
            duration: DUR.slow,
            ease: EASE,
            onUpdate: () => {
              shown.current = proxy.deg;
              set(proxy.deg);
            },
            onComplete: () => {
              shown.current = target;
              set(target);
            },
          });
        }
      );
    },
    { scope: root, dependencies: [target] }
  );

  const hole = Math.round(size * 0.13);
  const half = "absolute inset-0 overflow-hidden";
  const disc = "absolute inset-0 rounded-full [background:linear-gradient(to_right,currentColor_50%,transparent_50%)]";
  const discRight = "absolute inset-0 rounded-full [background:linear-gradient(to_left,currentColor_50%,transparent_50%)]";
  return (
    <div
      ref={root}
      role="img"
      aria-label={`Readiness score ${score} out of 100`}
      className={cn("relative shrink-0 rounded-full bg-muted", TONE[level], className)}
      style={{ width: size, height: size }}
    >
      <div className={half} style={{ clipPath: "inset(0 0 0 50%)" }}>
        <div ref={right} className={disc} />
      </div>
      <div className={half} style={{ clipPath: "inset(0 50% 0 0)" }}>
        <div ref={left} className={discRight} />
      </div>
      <div className="absolute rounded-full bg-card" style={{ inset: hole }} />
      <div className="absolute inset-0 grid place-items-center text-foreground">
        <div className="text-center leading-none">
          <CountUp value={score} className="text-3xl font-semibold tabular-nums" />
          <p className="mt-1 text-[11px] text-muted-foreground">of 100</p>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useRef, useState, type ReactNode } from "react";
import { DUR, NO_MOTION_QUERY, gsap, useGSAP } from "./gsap";

type Phase = "loading" | "fading" | "done";

/** Skeleton, then content. While `ready` is false only the skeleton shows. */
export function DataBoundary({ ready, skeleton, children, className }: { ready: boolean; skeleton: ReactNode; children: ReactNode; className?: string }) {
  const [phase, setPhase] = useState<Phase>(ready ? "done" : "loading");
  if (ready && phase === "loading") setPhase("fading"); // adjust state during render, the supported way to derive it

  const content = useRef<HTMLDivElement>(null);
  const skel = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (phase !== "fading") return;
      const done = () => setPhase("done");
      const mm = gsap.matchMedia();
      mm.add(
        { motion: NO_MOTION_QUERY },
        (ctx) => {
          if (!ctx.conditions?.motion || !content.current || !skel.current) return done();
          gsap.fromTo(content.current, { opacity: 0 }, { opacity: 1, duration: DUR.fast - 0.03, ease: "power2.out", clearProps: "opacity" });
          gsap.to(skel.current, { opacity: 0, duration: DUR.fast - 0.03, ease: "power2.out", onComplete: done });
        }
      );
    },
    { dependencies: [phase] }
  );

  return (
    <div className={className} style={{ position: "relative" }}>
      <div ref={content}>{phase === "loading" ? null : children}</div>
      {phase !== "done" && (
        <div ref={skel} aria-hidden={phase === "fading"} style={phase === "fading" ? { position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" } : undefined}>
          {skeleton}
        </div>
      )}
    </div>
  );
}

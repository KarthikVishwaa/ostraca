"use client";

import { useRef } from "react";
import { NO_MOTION_QUERY, ScrollTrigger, gsap, useGSAP } from "@/components/motion/gsap";

/** Pottery shards (ostraca) drifting slowly. Pure decoration for wide screens. Only transform and opacity move. */
const SHARDS = [
  { cls: "left-[8%] top-[6%] h-28 w-36 bg-primary", clip: "polygon(8% 12%, 92% 0, 100% 62%, 58% 100%, 0 78%)", rot: -8, drift: 12 },
  { cls: "right-[6%] top-[14%] h-24 w-28 bg-primary/70", clip: "polygon(0 20%, 70% 0, 100% 45%, 78% 100%, 12% 88%)", rot: 10, drift: 9 },
  { cls: "left-[30%] top-[34%] h-36 w-44 bg-accent", clip: "polygon(14% 0, 100% 18%, 88% 86%, 36% 100%, 0 55%)", rot: 5, drift: 14 },
  { cls: "right-[10%] top-[52%] h-28 w-32 bg-primary/45", clip: "polygon(10% 8%, 96% 0, 84% 70%, 40% 100%, 0 60%)", rot: -12, drift: 10 },
  { cls: "left-[4%] top-[58%] h-20 w-24 bg-primary/80", clip: "polygon(0 30%, 55% 0, 100% 40%, 66% 100%, 8% 84%)", rot: 14, drift: 8 },
  { cls: "left-[44%] top-[78%] h-24 w-32 bg-accent", clip: "polygon(6% 14%, 88% 0, 100% 72%, 46% 100%, 0 70%)", rot: -6, drift: 11 },
];

export function ShardMotif() {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = root.current;
      if (!el) return;
      const mm = gsap.matchMedia();
      mm.add(NO_MOTION_QUERY, () => {
        const shards = Array.from(el.querySelectorAll<HTMLElement>("[data-shard]"));
        const ring = el.querySelector<HTMLElement>("[data-ring]");
        gsap.from(shards, { opacity: 0, scale: 0.8, y: 20, duration: 0.8, ease: "power3.out", stagger: 0.09 });
        const loops = shards.map((s, i) =>
          gsap.to(s, {
            y: SHARDS[i].drift * (i % 2 ? -1 : 1),
            rotation: `+=${SHARDS[i].rot / 3}`,
            duration: 4 + i * 0.55,
            ease: "sine.inOut",
            yoyo: true,
            repeat: -1,
            paused: true,
          })
        );
        const spin = ring ? gsap.to(ring, { rotation: 360, duration: 90, ease: "none", repeat: -1, paused: true }) : null;
        // The drift only runs while the motif is on screen.
        const st = ScrollTrigger.create({
          trigger: el,
          onToggle: (self) => [...loops, spin].forEach((t) => (self.isActive ? t?.play() : t?.pause())),
        });
        return () => {
          st.kill();
          gsap.killTweensOf([...shards, ring]);
        };
      });
    },
    { scope: root }
  );

  return (
    <div ref={root} aria-hidden className="relative hidden h-[26rem] w-full lg:block">
      <div data-ring className="absolute left-1/2 top-1/2 size-[22rem] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-primary/30" />
      {SHARDS.map((s, i) => (
        <div key={i} data-shard className={`absolute ${s.cls}`} style={{ clipPath: s.clip, transform: `rotate(${s.rot}deg)` }} />
      ))}
    </div>
  );
}

"use client";

import { useRef, type ReactNode } from "react";
import Link from "next/link";
import { gsap, useGSAP } from "./gsap";
import { cn } from "@/lib/utils";

const MAX_TILT = 7; // degrees of rotateX / rotateY at the card's edge
const MAX_ROLL = 1.5; // degrees of rotateZ
const LIFT = 1.02; // scale on hover
const DEPTH_SHIFT = 6; // px a data-depth child moves the opposite way at depth 1
const DEPTH_TILT = 2; // extra degrees of tilt for a data-depth child at depth 1
const PERSPECTIVE = 900;

const clamp = (n: number) => Math.max(-1, Math.min(1, n));

/** A link-card that tilts toward the cursor in 3D. */
export function TiltCard({ href, children, className, label }: { href: string; children: ReactNode; className?: string; label?: string }) {
  const ref = useRef<HTMLAnchorElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      const mm = gsap.matchMedia();

      mm.add(
        {
          tilt: "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)",
          touch: "(hover: none) and (prefers-reduced-motion: no-preference)",
          motion: "(prefers-reduced-motion: no-preference)",
        },
        (ctx) => {
          const { tilt, touch, motion } = ctx.conditions as { tilt: boolean; touch: boolean; motion: boolean };
          if (!motion) return; // reduced motion: flat, no animation of any kind
          const undo: Array<() => void> = [];
          const depthEls = Array.from(el.querySelectorAll<HTMLElement>("[data-depth]"));
          const depthOf = (d: HTMLElement) => Number(d.dataset.depth) || 1;

          // Keyboard focus: lift only. Runs for every pointer type.
          const onFocusIn = () => {
            if (el.matches(":focus-visible")) gsap.to(el, { y: -3, scale: LIFT, duration: 0.25, ease: "power3.out", overwrite: "auto" });
          };
          const onFocusOut = () => gsap.to(el, { y: 0, scale: 1, duration: 0.3, ease: "power3.out", overwrite: "auto" });
          el.addEventListener("focusin", onFocusIn);
          el.addEventListener("focusout", onFocusOut);
          undo.push(() => {
            el.removeEventListener("focusin", onFocusIn);
            el.removeEventListener("focusout", onFocusOut);
          });

          if (touch && !tilt) {
            const down = () => gsap.to(el, { scale: 0.98, duration: 0.1, ease: "power3.out", overwrite: "auto" });
            const up = () => gsap.to(el, { scale: 1, duration: 0.2, ease: "power3.out", overwrite: "auto" });
            el.addEventListener("pointerdown", down);
            el.addEventListener("pointerup", up);
            el.addEventListener("pointercancel", up);
            el.addEventListener("pointerleave", up);
            undo.push(() => {
              el.removeEventListener("pointerdown", down);
              el.removeEventListener("pointerup", up);
              el.removeEventListener("pointercancel", up);
              el.removeEventListener("pointerleave", up);
            });
          }

          if (tilt) {
            let rect: DOMRect | null = null;
            let inside = false;
            let raf = 0;
            let q: ReturnType<typeof build> | null = null;

            const build = () => ({
              rx: gsap.quickTo(el, "rotationX", { duration: 0.35, ease: "power3.out" }),
              ry: gsap.quickTo(el, "rotationY", { duration: 0.35, ease: "power3.out" }),
              rz: gsap.quickTo(el, "rotation", { duration: 0.4, ease: "power3.out" }),
              depth: depthEls.map((d) => ({
                depth: depthOf(d),
                x: gsap.quickTo(d, "x", { duration: 0.4, ease: "power3.out" }),
                y: gsap.quickTo(d, "y", { duration: 0.4, ease: "power3.out" }),
                rx: gsap.quickTo(d, "rotationX", { duration: 0.4, ease: "power3.out" }),
                ry: gsap.quickTo(d, "rotationY", { duration: 0.4, ease: "power3.out" }),
              })),
            });

            const measure = () => {
              rect = el.getBoundingClientRect();
            };
            // Bounds only change on scroll or resize; refresh them there (at most once per frame), never in pointermove.
            const refresh = () => {
              if (!inside || raf) return;
              raf = requestAnimationFrame(() => {
                raf = 0;
                measure();
              });
            };

            const onEnter = (e: PointerEvent) => {
              if (e.pointerType === "touch") return;
              inside = true;
              measure();
              gsap.killTweensOf([el, ...depthEls]);
              // Perspective is set here, not at mount, so the entrance animation's clearProps cannot wipe it.
              gsap.set([el, ...depthEls], { transformPerspective: PERSPECTIVE, transformOrigin: "center" });
              q = build();
              gsap.to(el, { scale: LIFT, duration: 0.35, ease: "power3.out", overwrite: "auto" });
              window.addEventListener("scroll", refresh, { passive: true });
              window.addEventListener("resize", refresh, { passive: true });
            };

            const onMove = (e: PointerEvent) => {
              if (!inside || !rect || !q || e.pointerType === "touch") return;
              const nx = clamp((e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2));
              const ny = clamp((e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2));
              q.rx(-ny * MAX_TILT);
              q.ry(nx * MAX_TILT);
              q.rz(nx * MAX_ROLL);
              for (const d of q.depth) {
                d.x(-nx * DEPTH_SHIFT * d.depth);
                d.y(-ny * DEPTH_SHIFT * d.depth);
                d.rx(-ny * DEPTH_TILT * d.depth);
                d.ry(nx * DEPTH_TILT * d.depth);
              }
            };

            const onLeave = () => {
              if (!inside) return;
              inside = false;
              q = null;
              cancelAnimationFrame(raf);
              raf = 0;
              window.removeEventListener("scroll", refresh);
              window.removeEventListener("resize", refresh);
              const spring = { duration: 0.9, ease: "elastic.out(1, 0.55)", overwrite: true } as const;
              gsap.to(el, { rotationX: 0, rotationY: 0, rotation: 0, scale: 1, ...spring });
              if (depthEls.length) gsap.to(depthEls, { x: 0, y: 0, rotationX: 0, rotationY: 0, ...spring });
            };

            el.addEventListener("pointerenter", onEnter);
            el.addEventListener("pointermove", onMove);
            el.addEventListener("pointerleave", onLeave);
            undo.push(() => {
              inside = false;
              cancelAnimationFrame(raf);
              window.removeEventListener("scroll", refresh);
              window.removeEventListener("resize", refresh);
              el.removeEventListener("pointerenter", onEnter);
              el.removeEventListener("pointermove", onMove);
              el.removeEventListener("pointerleave", onLeave);
            });
          }

          return () => {
            undo.forEach((fn) => fn());
            gsap.killTweensOf([el, ...depthEls]);
          };
        }
      );
    },
    { scope: ref }
  );

  return (
    <Link
      ref={ref}
      href={href}
      prefetch
      aria-label={label}
      className={cn(
        "group relative flex min-h-[18rem] flex-col overflow-hidden rounded-xl border bg-card pt-6 text-card-foreground shadow-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60",
        className
      )}
    >
      {children}
    </Link>
  );
}

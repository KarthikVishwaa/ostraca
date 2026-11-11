"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { gsap } from "@/components/motion/gsap";

/** Fire this to start the bar for navigations that are not link clicks (for example router.push from a table row). */
export const NAV_START_EVENT = "ostraca:nav-start";
export const startNavProgress = () => window.dispatchEvent(new Event(NAV_START_EVENT));

/**
 * Thin progress bar at the top of the page. It starts when an internal link is clicked, creeps toward 85%,
 * and finishes when the pathname changes.
 */
export function NavProgress() {
  const bar = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const lastPath = useRef(pathname);
  const active = useRef(false);

  useEffect(() => {
    const el = bar.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let safety: ReturnType<typeof setTimeout> | undefined;

    const finish = () => {
      if (!active.current) return;
      active.current = false;
      clearTimeout(safety);
      gsap.killTweensOf(el);
      gsap.to(el, { scaleX: 1, duration: reduce ? 0 : 0.2, ease: "power2.out" });
      gsap.to(el, { opacity: 0, duration: reduce ? 0 : 0.3, delay: reduce ? 0 : 0.2 });
    };
    const start = () => {
      if (active.current) return;
      active.current = true;
      gsap.killTweensOf(el);
      gsap.set(el, { scaleX: 0, opacity: 1 });
      gsap.to(el, { scaleX: 0.85, duration: reduce ? 0 : 6, ease: "power2.out" });
      safety = setTimeout(finish, 10_000); // never leave the bar stuck
    };

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
      start();
    };
    document.addEventListener("click", onClick);
    window.addEventListener(NAV_START_EVENT, start);
    window.addEventListener("ostraca:nav-end", finish);

    return () => {
      document.removeEventListener("click", onClick);
      window.removeEventListener(NAV_START_EVENT, start);
      window.removeEventListener("ostraca:nav-end", finish);
      clearTimeout(safety);
      gsap.killTweensOf(el);
    };
  }, []);

  // Route changed: finish the bar.
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    window.dispatchEvent(new Event("ostraca:nav-end"));
  }, [pathname]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 print:hidden">
      <div ref={bar} className="h-full origin-left bg-primary opacity-0" style={{ transform: "scaleX(0)" }} />
    </div>
  );
}

"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ExternalLink, type LucideIcon } from "lucide-react";
import { DUR, EASE, gsap } from "@/components/motion/gsap";
import { cn } from "@/lib/utils";

/**
 * A "shifting dropdown" navigation bar. Hover (or tap, or press Enter) a tab and one floating panel opens under
 * it with a small nub pointing at the tab. Moving to another tab slides the nub sideways and the panel content
 * slides in from the direction you came from.
 *
 * Built with GSAP and animates only transform and opacity. With prefers-reduced-motion every change is instant.
 * Generic: it knows nothing about Ostraca, pass `tabs`.
 */
export type DropdownItem = {
  title: string;
  href: string;
  description?: string;
  icon?: LucideIcon;
  /** Opens in a new tab with rel="noopener noreferrer". */
  external?: boolean;
};

export type DropdownTab = {
  id: string;
  title: string;
  /** A tab with only `href` is a plain link (no panel). */
  href?: string;
  items?: DropdownItem[];
  /** Custom panel body instead of a list of items. Call `close()` from links inside it. */
  render?: (api: { close: () => void }) => ReactNode;
  /** Small text under the items. */
  note?: ReactNode;
  /** Which routes make this tab "active". Default: any of its items' hrefs, or its own href. */
  isActive?: (pathname: string) => boolean;
};

/** Route match used for the active state. "/ledger" also covers /sales/*, because a sale belongs to the proof ledger. "/" matches only the home page. */
export const hrefMatches = (href: string, pathname: string) =>
  href === "/" ? pathname === "/" : href === "/ledger" ? pathname.startsWith("/ledger") || pathname.startsWith("/sales") : href.startsWith("http") ? false : pathname === href || pathname.startsWith(`${href}/`);

export const isTabActive = (tab: DropdownTab, pathname: string) =>
  tab.isActive ? tab.isActive(pathname) : [tab.href, ...(tab.items?.map((i) => i.href) ?? [])].some((h) => !!h && hrefMatches(h, pathname));

const PANEL_W = 352; // px, 22rem
const MARGIN = 8; // never closer than this to the viewport edge
const CLOSE_DELAY = 120; // ms, so the pointer can cross the gap between tab and panel
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function ShiftingDropdown({ tabs, className }: { tabs: DropdownTab[]; className?: string }) {
  const pathname = usePathname();
  const uid = useId();
  const panelId = `${uid}-panel`;

  const root = useRef<HTMLElement>(null);
  const tabEls = useRef<Array<HTMLElement | null>>([]);
  const panel = useRef<HTMLDivElement>(null);
  const nub = useRef<HTMLSpanElement>(null);
  const body = useRef<HTMLDivElement>(null);

  const [active, setActive] = useState<string | null>(null); // the tab that should be open
  const activeRef = useRef<string | null>(null); // same value, readable synchronously inside handlers
  const [shown, setShown] = useState<string | null>(null); // the tab whose panel is on screen (lags `active` while fading out)
  const pinned = useRef(false); // opened by click/tap/keyboard: hover-out does not close it
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const prevIndex = useRef(-1);
  const wasVisible = useRef(false);
  const dir = useRef(1);

  const indexOf = (id: string | null) => tabs.findIndex((t) => t.id === id);
  const hasPanel = (t: DropdownTab) => !!(t.items?.length || t.render);

  const clearTimer = () => {
    clearTimeout(closeTimer.current);
    closeTimer.current = undefined;
  };

  const open = useCallback(
    (id: string, how: "hover" | "pin") => {
      clearTimer();
      if (how === "pin") pinned.current = true;
      if (activeRef.current !== id) {
        // Which way did we move? The content slides in from that side.
        dir.current = Math.sign(tabs.findIndex((t) => t.id === id) - prevIndex.current) || 1;
        prevIndex.current = tabs.findIndex((t) => t.id === id);
      }
      activeRef.current = id;
      setActive(id);
    },
    [tabs]
  );

  const close = useCallback(
    (returnFocus = false) => {
      clearTimer();
      pinned.current = false;
      prevIndex.current = -1;
      const was = activeRef.current;
      activeRef.current = null;
      setActive(null);
      if (was && returnFocus) {
        const i = tabs.findIndex((t) => t.id === was);
        queueMicrotask(() => tabEls.current[i]?.focus());
      }
    },
    [tabs]
  );

  const scheduleClose = () => {
    if (pinned.current) return;
    clearTimer();
    closeTimer.current = setTimeout(() => close(), CLOSE_DELAY);
  };

  // Place the panel and nub under the active tab. Both move with transforms only (x), never left/width.
  const place = useCallback(
    (animate: boolean) => {
      const r = root.current;
      const p = panel.current;
      const n = nub.current;
      const i = indexOf(shown);
      const t = tabEls.current[i];
      if (!r || !p || !n || !t) return;
      const rr = r.getBoundingClientRect();
      const tr = t.getBoundingClientRect();
      const w = Math.min(PANEL_W, window.innerWidth - MARGIN * 2);
      const center = tr.left + tr.width / 2 - rr.left; // tab centre in the nav's coordinates
      const minLeft = MARGIN - rr.left;
      const maxLeft = window.innerWidth - MARGIN - w - rr.left;
      const left = Math.min(Math.max(center - w / 2, minLeft), Math.max(minLeft, maxLeft)); // clamped: never off screen
      const nubX = Math.min(Math.max(center - left, 18), w - 18); // nub stays on the panel, pointing at the tab
      const dur = animate && !reducedMotion() ? DUR.base - 0.1 : 0;
      gsap.to(p, { x: left, duration: dur, ease: EASE, overwrite: "auto" });
      gsap.to(n, { x: nubX, duration: dur, ease: EASE, overwrite: "auto" });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shown, tabs]
  );

  // `active` -> `shown` and the open/close fades.
  useLayoutEffect(() => {
    const p = panel.current;
    if (active) {
      if (shown !== active) setShown(active);
      return;
    }
    if (!shown || !p) return;
    // Closing: fade + 8px down, then unmount. If it reopens meanwhile, this effect re-runs and the tween is killed.
    wasVisible.current = false;
    if (reducedMotion()) return void setShown(null);
    gsap.to(p, { opacity: 0, y: 8, duration: DUR.fast - 0.08, ease: EASE, overwrite: "auto", onComplete: () => setShown(null) });
  }, [active, shown]);

  // A tab is on screen: position it, and animate in (first open) or shift (switching tabs).
  useLayoutEffect(() => {
    const p = panel.current;
    const b = body.current;
    if (!shown || !p || !b || active !== shown) return;
    const instant = reducedMotion();
    const first = !wasVisible.current;
    place(!first); // first open: appear in place. Tab to tab: the panel and nub glide sideways
    if (first) {
      gsap.fromTo(p, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: instant ? 0 : DUR.fast, ease: EASE, overwrite: "auto" });
    } else {
      gsap.to(p, { opacity: 1, y: 0, duration: 0, overwrite: "auto" });
      gsap.fromTo(b, { x: dir.current * 32, opacity: 0 }, { x: 0, opacity: 1, duration: instant ? 0 : DUR.fast + 0.03, ease: EASE, overwrite: "auto", clearProps: "transform,opacity" });
    }
    wasVisible.current = true;
  }, [shown, active, place]);

  // Re-measure on resize and scroll-bar changes.
  useEffect(() => {
    if (!shown) return;
    const onResize = () => place(false);
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(onResize);
    if (root.current) ro.observe(root.current);
    return () => {
      window.removeEventListener("resize", onResize);
      ro.disconnect();
    };
  }, [shown, place]);

  // Route change closes the panel at once (no fade, so it can never linger over the new page).
  useEffect(() => {
    clearTimer();
    pinned.current = false;
    prevIndex.current = -1;
    wasVisible.current = false;
    activeRef.current = null;
    if (panel.current) gsap.killTweensOf(panel.current);
    setActive(null);
    setShown(null);
  }, [pathname]);

  // Click or tap outside closes it.
  useEffect(() => {
    if (!active) return;
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) close();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [active, close]);

  // No tween or timer outlives the component.
  useEffect(
    () => () => {
      clearTimeout(closeTimer.current);
      [panel.current, nub.current, body.current].forEach((el) => el && gsap.killTweensOf(el));
    },
    []
  );

  const focusables = () => tabEls.current.filter((el): el is HTMLElement => !!el);

  function onTabKey(e: KeyboardEvent<HTMLElement>, i: number) {
    const tab = tabs[i];
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const next = (i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
      tabEls.current[next]?.focus();
      if (active && hasPanel(tabs[next])) open(tabs[next].id, "pin");
      else if (active) close();
    } else if (e.key === "ArrowDown" && hasPanel(tab)) {
      e.preventDefault();
      open(tab.id, "pin");
      // Move into the panel once it has rendered.
      requestAnimationFrame(() => requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()));
    } else if (e.key === "Escape" && active) {
      e.preventDefault();
      close(true);
    }
  }

  function onPanelKey(e: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(panel.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      close(true);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = items.length;
      const next = e.key === "ArrowDown" ? (at + 1) % n : at <= 0 ? n - 1 : at - 1;
      items[next]?.focus();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      // Side arrows keep working across tabs from inside the panel.
      e.preventDefault();
      const i = indexOf(shown);
      const next = (i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
      tabEls.current[next]?.focus();
      if (hasPanel(tabs[next])) open(tabs[next].id, "pin");
      else close();
    }
  }

  const current = tabs.find((t) => t.id === shown);

  return (
    <nav
      ref={root}
      aria-label="Main"
      className={cn("relative", className)}
      onBlur={(e) => {
        // Keyboard focus left the whole nav: close.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null) && e.relatedTarget) close();
      }}
    >
      <ul className="flex items-center">
        {tabs.map((tab, i) => {
          const activeNow = isTabActive(tab, pathname);
          const isOpen = active === tab.id;
          const base = cn(
            "relative inline-flex h-14 items-center gap-1 rounded-md px-3 text-sm outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50",
            "after:pointer-events-none after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary after:transition-opacity",
            activeNow ? "font-medium text-foreground after:opacity-100" : "text-muted-foreground after:opacity-0 hover:text-foreground",
            isOpen && "text-foreground"
          );
          return (
            <li key={tab.id}>
              {hasPanel(tab) ? (
                <button
                  type="button"
                  ref={(el) => {
                    tabEls.current[i] = el;
                  }}
                  className={base}
                  aria-haspopup="menu"
                  aria-expanded={isOpen}
                  aria-controls={isOpen ? panelId : undefined}
                  aria-current={activeNow ? "true" : undefined}
                  onPointerEnter={(e) => {
                    if (e.pointerType === "mouse") open(tab.id, "hover");
                  }}
                  onPointerLeave={(e) => {
                    if (e.pointerType === "mouse") scheduleClose();
                  }}
                  onClick={() => {
                    // Click toggles. If hover had just opened it, the click keeps it open ("pins" it) instead of closing it.
                    if (isOpen && pinned.current) close();
                    else open(tab.id, "pin");
                  }}
                  onKeyDown={(e) => onTabKey(e, i)}
                >
                  {tab.title}
                  <ChevronDown aria-hidden className={cn("size-3.5 transition-transform duration-200", isOpen && "rotate-180")} />
                </button>
              ) : (
                <Link
                  href={tab.href ?? "/"}
                  prefetch
                  ref={(el) => {
                    tabEls.current[i] = el;
                  }}
                  className={base}
                  aria-current={activeNow ? "page" : undefined}
                  onPointerEnter={(e) => e.pointerType === "mouse" && active && scheduleClose()}
                  onKeyDown={(e) => onTabKey(e, i)}
                >
                  {tab.title}
                </Link>
              )}
            </li>
          );
        })}
      </ul>

      {shown && current && (
        // The wrapper starts right under the bar and has transparent top padding: that is the hover "bridge", so the
        // pointer can cross from the tab to the panel without the panel closing.
        <div
          ref={panel}
          id={panelId}
          className="absolute left-0 top-full z-50 pt-1"
          style={{ width: `min(${PANEL_W}px, calc(100vw - ${MARGIN * 2}px))` }}
          onPointerEnter={(e) => e.pointerType === "mouse" && clearTimer()}
          onPointerLeave={(e) => e.pointerType === "mouse" && scheduleClose()}
        >
          <div className="relative rounded-xl border bg-popover p-2 text-popover-foreground shadow-lg">
            {/* The nub: a rotated square, half hidden behind the panel's top edge, moved with translateX. */}
            <span ref={nub} aria-hidden className="pointer-events-none absolute -top-[7px] left-0 -ml-[7px] block size-3.5">
              <span className="block size-full rotate-45 rounded-tl-sm border-l border-t bg-popover" />
            </span>
            <div ref={body} role="menu" aria-label={current.title} onKeyDown={onPanelKey} className="relative">
              {current.render ? (
                current.render({ close: () => close() })
              ) : (
                <ul className="space-y-0.5">
                  {current.items?.map((item) => (
                    <li key={item.title} role="none">
                      <PanelLink item={item} onNavigate={() => close()} />
                    </li>
                  ))}
                </ul>
              )}
              {current.note && <div className="mt-1 border-t px-3 pb-1 pt-2.5 text-xs text-muted-foreground">{current.note}</div>}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}

function PanelLink({ item, onNavigate }: { item: DropdownItem; onNavigate: () => void }) {
  const Icon = item.icon;
  const inner = (
    <>
      {Icon && (
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-accent text-primary">
          <Icon className="size-4" aria-hidden />
        </span>
      )}
      <span className="min-w-0">
        <span className="flex items-center gap-1 text-sm font-medium">
          {item.title}
          {item.external && <ExternalLink className="size-3 text-muted-foreground" aria-hidden />}
        </span>
        {item.description && <span className="block text-xs text-muted-foreground">{item.description}</span>}
      </span>
    </>
  );
  const cls = "flex min-h-11 items-start gap-3 rounded-lg px-3 py-2 outline-none transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50";
  return item.external ? (
    <a role="menuitem" href={item.href} target="_blank" rel="noopener noreferrer" className={cls} onClick={onNavigate}>
      {inner}
    </a>
  ) : (
    <Link role="menuitem" href={item.href} prefetch className={cls} onClick={onNavigate}>
      {inner}
    </Link>
  );
}

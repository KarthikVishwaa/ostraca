"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLink, FileSearch, FlaskConical, Gavel, GitBranch, Menu, ReceiptText, Scale, ShieldCheck, ShoppingBag, BookOpen } from "lucide-react";
import { BrandLogo } from "@/components/brand/logo";
import { StatusDot } from "@/components/layout/status-dot";
import { DUR, gsap } from "@/components/motion/gsap";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ShiftingDropdown, hrefMatches, isTabActive, type DropdownItem, type DropdownTab } from "@/components/ui/shifting-dropdown";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const REPO = "https://github.com/KarthikVishwaa/ostraca";

/** The Ostraca navigation: one direct link and three dropdowns. Routes are the ones that exist in the app. */
export const NAV_TABS: DropdownTab[] = [
  { id: "ledger", title: "Proof ledger", href: "/ledger" },
  {
    id: "product",
    title: "Product",
    items: [
      { title: "Capture proof", description: "Add receipts, check them with code, file tracking", href: "/ledger", icon: ShieldCheck },
      { title: "Answer disputes", description: "Cited drafts from verified proof", href: "/disputes", icon: Scale },
      { title: "Limitation pack", description: "One document of your sales and proof (simulated)", href: "/limitation", icon: FileSearch },
    ],
  },
  {
    id: "try",
    title: "Try it",
    items: [
      { title: "Make a test sale", description: "Pay with a sandbox buyer account", href: "/store", icon: ShoppingBag },
      { title: "Open disputes", description: "See and answer disputes from PayPal", href: "/disputes", icon: Gavel },
      { title: "Simulate a limitation", description: "Build the pack for a pretend notice", href: "/limitation", icon: FlaskConical },
    ],
    note: "Runs on the PayPal sandbox. No real money.",
  },
  {
    id: "about",
    title: "About",
    // The app has no docs pages, so these open the README sections on GitHub.
    items: [
      { title: "How it works", description: "The three flows, step by step", href: `${REPO}#what-it-does`, icon: BookOpen, external: true },
      { title: "Safety rules", description: "What is checked and what needs your approval", href: `${REPO}#safety-rules-built-in`, icon: ReceiptText, external: true },
      { title: "GitHub", description: "Source code and setup guide", href: REPO, icon: GitBranch, external: true },
    ],
  },
];

function Logo() {
  return (
    <Link href="/" prefetch aria-label="Ostraca, home" className="flex min-h-11 items-center rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
      <BrandLogo size={30} className="text-base" />
    </Link>
  );
}

/** Mobile menu body: the same groups as the dropdowns, stacked, with 44px+ targets. */
function MobileLink({ item, current }: { item: DropdownItem; current: boolean }) {
  const Icon = item.icon;
  const cls = cn(
    "flex min-h-12 items-center gap-3 rounded-md px-3 text-base outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
    current ? "bg-accent font-medium text-accent-foreground" : "text-foreground active:bg-accent"
  );
  const inner = (
    <>
      {Icon && <Icon className="size-4 shrink-0 text-primary" aria-hidden />}
      <span className="min-w-0">
        <span className="flex items-center gap-1">
          {item.title}
          {item.external && <ExternalLink className="size-3 text-muted-foreground" aria-hidden />}
        </span>
        {item.description && <span className="block text-xs font-normal text-muted-foreground">{item.description}</span>}
      </span>
    </>
  );
  return (
    <SheetClose asChild>
      {item.external ? (
        <a href={item.href} target="_blank" rel="noopener noreferrer" className={cls}>
          {inner}
        </a>
      ) : (
        <Link href={item.href} prefetch aria-current={current ? "page" : undefined} className={cls}>
          {inner}
        </Link>
      )}
    </SheetClose>
  );
}

function MobileMenu({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  // The route changed (a link was followed): make sure the sheet is shut.
  useEffect(() => setOpen(false), [pathname]);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[min(88vw,22rem)] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Ostraca</SheetTitle>
          <SheetDescription>Prove it before they ask.</SheetDescription>
        </SheetHeader>
        <nav aria-label="Mobile" className="flex flex-col gap-5 px-4 pb-6">
          {NAV_TABS.map((tab) =>
            tab.items ? (
              <section key={tab.id} aria-labelledby={`m-${tab.id}`} className="space-y-1">
                <h2 id={`m-${tab.id}`} className="px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {tab.title}
                </h2>
                {tab.items.map((item) => (
                  <MobileLink key={item.title} item={item} current={hrefMatches(item.href, pathname)} />
                ))}
                {tab.note && <p className="px-3 pt-1 text-xs text-muted-foreground">{tab.note}</p>}
              </section>
            ) : (
              <MobileLink key={tab.id} item={{ title: tab.title, href: tab.href ?? "/", icon: ReceiptText }} current={isTabActive(tab, pathname)} />
            )
          )}
        </nav>
        <div className="mt-auto flex items-center gap-2 p-4">
          <Badge variant="outline">PayPal sandbox</Badge>
          <span className="text-xs text-muted-foreground">Test money only</span>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** The site header. It lives in the root layout, so navigation never remounts it. */
export function SiteHeader() {
  const pathname = usePathname();
  const solid = useRef<HTMLDivElement>(null);

  // After a little scroll the header gets more solid: a second layer fades in (opacity only).
  useEffect(() => {
    const layer = solid.current;
    if (!layer) return;
    let on = false;
    let raf = 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const check = () => {
      raf = 0;
      const next = window.scrollY > 8;
      if (next === on) return;
      on = next;
      gsap.to(layer, { opacity: on ? 1 : 0, duration: reduce ? 0 : DUR.fast, ease: "power2.out", overwrite: "auto" });
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(check);
    };
    check();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
      gsap.killTweensOf(layer);
    };
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 backdrop-blur-md print:hidden">
      <div aria-hidden className="absolute inset-0 -z-10 bg-background/60" />
      <div ref={solid} aria-hidden className="absolute inset-0 -z-10 bg-background opacity-0" />
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:gap-8">
        <Logo />
        <ShiftingDropdown tabs={NAV_TABS} className="hidden md:block" />

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <Badge variant="outline" className="hidden sm:inline-flex">
            PayPal sandbox
          </Badge>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" aria-label="Service status" className="grid size-11 place-items-center rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 md:size-9">
                <StatusDot />
              </button>
            </TooltipTrigger>
            <TooltipContent>PayPal sandbox, database and settings check</TooltipContent>
          </Tooltip>
          <MobileMenu pathname={pathname} />
        </div>
      </div>
    </header>
  );
}

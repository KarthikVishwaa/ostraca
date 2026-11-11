"use client";

import { memo, useRef, useState, type ReactNode } from "react";
import { EASE, ScrollTrigger, gsap, inViewport, isBooting, useGSAP } from "@/components/motion/gsap";
import { cn } from "@/lib/utils";
import { ApproveDemo, CaptureDemo, DisputeDemo, PackDemo, SaleDemo, VerifyDemo } from "./station-demos";

type Station = { n: number; title: string; text: string; demo: ReactNode };

const STATIONS: Station[] = [
  { n: 1, title: "A sale happens", text: "A buyer pays through PayPal checkout. The $120.00 order is captured and lands in your proof ledger with a readiness score of 0.", demo: <SaleDemo /> },
  { n: 2, title: "Proof is captured", text: "Add the courier receipt photo, a voice note or a typed entry. The original is stored unchanged with a fingerprint, and AI only suggests the fields.", demo: <CaptureDemo /> },
  { n: 3, title: "Code verifies it", text: "Every value goes through plain code checks, not AI. A mistyped tracking number is rejected with the reason, and only a value that passes counts.", demo: <VerifyDemo /> },
  { n: 4, title: "You approve, PayPal is told", text: "Nothing reaches PayPal until you press Approve. Then the tracking is filed and the readiness score rises.", demo: <ApproveDemo /> },
  { n: 5, title: "A dispute arrives", text: "When a buyer says the item never arrived, Ostraca drafts a reply that cites only verified facts. You edit and approve it. PayPal alone decides the outcome.", demo: <DisputeDemo /> },
  { n: 6, title: "Limitation? Be ready", text: "If PayPal ever reviews your account, one document lists your sales matched to their proof, with the gaps called out. It cannot change PayPal's decision.", demo: <PackDemo /> },
];

/* ---- one station ------------------------------------------------------------------------------------------- */
const StationItem = memo(function StationItem({ s, side }: { s: Station; side: "left" | "right" }) {
  return (
    <li
      data-station
      data-side={side}
      className="relative pl-12 lg:grid lg:grid-cols-[1fr_9rem_1fr] lg:items-center lg:pl-0"
      aria-labelledby={`station-${s.n}`}
    >
      {/* Mobile and tablet: a numbered dot on the left line. A muted base and a "lit" layer that fades in. */}
      <span data-dot aria-hidden className="absolute left-0 top-6 grid size-9 place-items-center lg:hidden">
        <span className="absolute inset-0 rounded-full border-2 bg-card" />
        <span data-dot-lit className="absolute inset-0 rounded-full border-2 border-primary bg-primary" />
        <span className="relative text-sm font-semibold text-primary-foreground mix-blend-normal">{s.n}</span>
      </span>

      <div
        data-card
        className={cn("rounded-xl border bg-card p-5 text-card-foreground shadow-sm sm:p-6", side === "left" ? "lg:col-start-1" : "lg:col-start-3")}
      >
        <div className="flex items-center gap-3">
          <span data-badge className="hidden size-8 shrink-0 place-items-center rounded-md bg-primary text-sm font-semibold text-primary-foreground lg:grid">
            {s.n}
          </span>
          <h3 id={`station-${s.n}`} className="text-lg font-semibold tracking-tight">
            <span className="sr-only">Step {s.n}: </span>
            {s.title}
          </h3>
        </div>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">{s.text}</p>
        <div className="mt-4">{s.demo}</div>
        <p className="mt-2 text-xs text-muted-foreground">Example: numbers in this demo are made up.</p>
      </div>
    </li>
  );
});

/* ---- sticky "Step 3 of 6" ---------------------------------------------------------------------------------- */
function StepNav({ active, onJump }: { active: number; onJump: (i: number) => void }) {
  return (
    <div className="sticky top-16 z-30 rounded-xl border bg-background/90 px-3 py-2 backdrop-blur">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm">
          <span className="font-semibold tabular-nums">
            Step {active + 1} of {STATIONS.length}
          </span>
          <span className="text-muted-foreground"> · {STATIONS[active].title}</span>
        </p>
        <ol className="flex gap-1" aria-label="Jump to a step">
          {STATIONS.map((s, i) => (
            <li key={s.n}>
              <button
                type="button"
                onClick={() => onJump(i)}
                aria-label={`Go to step ${s.n}: ${s.title}`}
                aria-current={i === active ? "step" : undefined}
                className={cn(
                  "grid size-11 place-items-center rounded-md text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:size-9",
                  i === active ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground hover:bg-accent/70"
                )}
              >
                {s.n}
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/* ---- the roadmap ------------------------------------------------------------------------------------------- */
const POP = { duration: 0.35, ease: "back.out(2.4)" } as const;

export function Roadmap() {
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useGSAP(
    () => {
      const el = root.current;
      if (!el) return;
      const mm = gsap.matchMedia();

      // GSAP only runs this when at least one condition matches. "all" always does, so phones and tablets
      // (not desktop, not reduced-motion) are set up too.
      mm.add({ all: "(min-width: 0px)", lg: "(min-width: 1024px)", reduce: "(prefers-reduced-motion: reduce)" }, (ctx) => {
        const { lg, reduce } = ctx.conditions as { lg: boolean; reduce: boolean };
        const stations = Array.from(el.querySelectorAll<HTMLElement>("[data-station]"));
        const cards = stations.map((s) => s.querySelector<HTMLElement>("[data-card]")!);
        const badges = stations.map((s) => s.querySelector<HTMLElement>("[data-badge]"));
        const dots = stations.map((s) => s.querySelector<HTMLElement>("[data-dot]")!);
        const dotLit = stations.map((s) => s.querySelector<HTMLElement>("[data-dot-lit]")!);
        const sideOf = (i: number) => (stations[i].dataset.side === "left" ? -1 : 1);
        const svg = el.querySelector<SVGSVGElement>("[data-road]");
        const track = el.querySelector<SVGPathElement>("[data-road-track]");
        const fill = el.querySelector<SVGPathElement>("[data-road-fill]");
        const marker = el.querySelector<SVGGElement>("[data-road-marker]");
        const nodes = Array.from(el.querySelectorAll<SVGGElement>("[data-road-node]"));
        const railFill = el.querySelector<HTMLElement>("[data-rail-fill]");

        const lit: boolean[] = stations.map(() => false);
        let nodeY: number[] = [];
        let totalH = 1;
        let progressTween: gsap.core.Tween | null = null;
        let lenAtY: ((y: number) => number) | null = null;
        let pathLen = 1;
        let disposed = false;

        // A station "lights up" (its dot or road node): a muted base underneath, a primary layer that fades and pops in.
        const light = (i: number, on: boolean, instant = false) => {
          if (lit[i] === on) return;
          lit[i] = on;
          const layer = lg ? nodes[i]?.querySelector<SVGElement>("[data-lit]") : dotLit[i];
          if (!layer) return;
          const d = instant || reduce ? 0 : 0.3;
          gsap.to(layer, { opacity: on ? 1 : 0, scale: on ? 1 : 0.6, duration: d, ease: on ? "back.out(2.4)" : "power2.out", overwrite: true, transformOrigin: "50% 50%" });
          if (on && !instant && !reduce) {
            const b = lg ? badges[i] : dots[i];
            if (b) gsap.fromTo(b, { scale: 1 }, { scale: 1.18, ...POP, duration: 0.18, yoyo: true, repeat: 1, overwrite: "auto" });
          }
        };
        const lightUpTo = (y: number, instant = false) => stations.forEach((_, i) => light(i, y >= nodeY[i], instant));

        /* ---------- desktop: one SVG path, drawn with stroke-dashoffset, with a shard marker travelling on it ---------- */
        const buildRoad = () => {
          if (!svg || !track || !fill || !marker) return;
          const rect = el.getBoundingClientRect();
          const W = Math.round(rect.width);
          totalH = Math.max(1, Math.round(rect.height));
          const cx = W / 2;
          const amp = Math.min(64, W * 0.05);
          const ys = stations.map((s) => {
            const r = s.getBoundingClientRect();
            return r.top - rect.top + r.height / 2;
          });
          const pts = [{ x: cx, y: 0 }, ...ys.map((y, i) => ({ x: cx + sideOf(i) * amp, y })), { x: cx, y: totalH }];
          let d = `M${pts[0].x},${pts[0].y}`;
          for (let k = 1; k < pts.length; k++) {
            const a = pts[k - 1];
            const b = pts[k];
            const m = (a.y + b.y) / 2;
            d += ` C${a.x},${m} ${b.x},${m} ${b.x},${b.y}`; // smooth S-curve: vertical tangent at every station
          }
          svg.setAttribute("viewBox", `0 0 ${W} ${totalH}`);
          track.setAttribute("d", d);
          fill.setAttribute("d", d);
          pathLen = fill.getTotalLength();
          fill.style.strokeDasharray = `${pathLen}`;

          // Path is monotonic in y, so the length at a given y is found by bisection. Sample it once into a table.
          const find = (y: number) => {
            let lo = 0;
            let hi = pathLen;
            for (let n = 0; n < 22; n++) {
              const mid = (lo + hi) / 2;
              if (fill.getPointAtLength(mid).y < y) lo = mid;
              else hi = mid;
            }
            return (lo + hi) / 2;
          };
          const N = Math.max(60, Math.round(totalH / 8));
          const table = Array.from({ length: N + 1 }, (_, k) => find((k / N) * totalH));
          lenAtY = (y) => {
            const f = Math.min(Math.max(y / totalH, 0), 1) * N;
            const k = Math.min(Math.floor(f), N - 1);
            return table[k] + (table[k + 1] - table[k]) * (f - k);
          };
          nodeY = ys;
          nodes.forEach((n, i) => {
            const p = fill.getPointAtLength(find(ys[i]));
            n.setAttribute("transform", `translate(${p.x} ${p.y})`);
          });
          gsap.set(svg, { opacity: 1 });
        };

        const draw = (y: number) => {
          if (!lenAtY || !fill || !marker) return;
          const len = lenAtY(y);
          fill.style.strokeDashoffset = `${pathLen - len}`;
          const p = fill.getPointAtLength(len);
          const a = fill.getPointAtLength(Math.min(pathLen, len + 3));
          const b = fill.getPointAtLength(Math.max(0, len - 3));
          const angle = (Math.atan2(a.y - b.y, a.x - b.x) * 180) / Math.PI;
          marker.setAttribute("transform", `translate(${p.x} ${p.y}) rotate(${angle})`);
          lightUpTo(y);
        };

        const startProgress = () => {
          progressTween?.scrollTrigger?.kill();
          progressTween?.kill();
          const prog = { p: 0 };
          const apply = () => (lg ? draw(prog.p * totalH) : mobileApply(prog.p));
          apply();
          if (reduce) {
            prog.p = 1;
            apply();
            return;
          }
          progressTween = gsap.to(prog, {
            p: 1,
            ease: "none",
            onUpdate: apply,
            scrollTrigger: { trigger: el, start: "top 70%", end: "bottom 70%", scrub: 0.4, invalidateOnRefresh: true },
          });
        };

        /* ---------- tablet and mobile: a straight line on the left that fills with scaleY ---------- */
        let dotY: number[] = [];
        const measureDots = () => {
          const rect = el.getBoundingClientRect();
          totalH = Math.max(1, Math.round(rect.height));
          dotY = dots.map((d) => {
            const r = d.getBoundingClientRect();
            return r.top - rect.top + r.height / 2;
          });
          nodeY = dotY;
        };
        const mobileApply = (p: number) => {
          if (railFill) gsap.set(railFill, { scaleY: p, transformOrigin: "50% 0%" });
          lightUpTo(p * totalH);
        };

        /* ---------- initial geometry and states ---------- */
        if (lg) {
          buildRoad();
        } else {
          measureDots();
        }
        // Start state is set here, just before animating (the HTML itself is fully visible).
        if (!reduce) {
          if (!lg && railFill) gsap.set(railFill, { scaleY: 0, transformOrigin: "50% 0%" });
          stations.forEach((_, i) => {
            gsap.set(lg ? nodes[i]?.querySelector("[data-lit]") : dotLit[i], { opacity: 0, scale: 0.6, transformOrigin: "50% 50%" });
          });
        }
        startProgress();

        /* ---------- one ScrollTrigger per station: reveal the card, play its demo, track the active step ---------- */
        stations.forEach((li, i) => {
          const card = cards[i];
          const from = lg ? { opacity: 0, x: sideOf(i) * 48 } : { opacity: 0, y: 24 };
          if (!reduce && !(isBooting() && inViewport(li))) gsap.set(card, from);
          ScrollTrigger.create({
            trigger: li,
            start: "top 78%",
            end: "bottom 55%",
            onEnter: () => {
              setActive(i);
              if (reduce) return;
              gsap.to(card, { opacity: 1, x: 0, y: 0, duration: 0.55, ease: EASE, overwrite: "auto", clearProps: "transform,opacity" });
              li.dispatchEvent(new Event("station:enter"));
            },
            onEnterBack: () => setActive(i),
            onLeaveBack: () => {
              setActive(Math.max(0, i - 1));
              if (reduce) return;
              gsap.set(card, from); // scrolled back above it: hide again, so it can play when we return
              li.dispatchEvent(new Event("station:reset"));
            },
          });
        });

        /* ---------- rebuild on resize (debounced) and when fonts finish loading ---------- */
        let timer: ReturnType<typeof setTimeout> | undefined;
        const rebuild = () => {
          if (disposed) return;
          if (lg) buildRoad();
          else measureDots();
          startProgress();
          lightUpTo(reduce ? Infinity : lastY(), true);
          ScrollTrigger.refresh();
        };
        const lastY = () => (progressTween ? (progressTween.progress() as number) * totalH : 0);
        let first = true; // observe() reports once straight away; the geometry is already built
        const ro = new ResizeObserver(() => {
          if (first) return void (first = false);
          clearTimeout(timer);
          timer = setTimeout(rebuild, 150);
        });
        ro.observe(el);
        document.fonts?.ready.then(() => !disposed && rebuild());

        if (reduce) lightUpTo(Infinity, true);

        return () => {
          disposed = true;
          clearTimeout(timer);
          ro.disconnect();
          progressTween?.scrollTrigger?.kill();
          progressTween?.kill();
          const targets = [...cards, ...badges.filter(Boolean), ...dots, ...dotLit, ...nodes, svg, marker, railFill].filter(Boolean) as Element[];
          gsap.killTweensOf(targets);
          gsap.set(targets, { clearProps: "opacity,transform,visibility" });
          if (fill) fill.style.strokeDashoffset = "";
        };
      });
    },
    { scope: root }
  );

  const jump = (i: number) => {
    const target = root.current?.querySelectorAll<HTMLElement>("[data-station]")[i];
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  };

  return (
    <section aria-labelledby="roadmap-heading" className="space-y-6">
      <div className="space-y-2">
        <h2 id="roadmap-heading" className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Follow one sale: Priya&apos;s $120 handloom saree
        </h2>
        <p className="max-w-2xl text-muted-foreground">Six stations from checkout to a possible account review. Every number is an example.</p>
      </div>

      <StepNav active={active} onJump={jump} />

      <div ref={root} className="relative pt-2">
        {/* Desktop road. Hidden until JavaScript has measured it, since it is decoration only. */}
        <svg data-road aria-hidden className="pointer-events-none absolute inset-0 hidden size-full overflow-visible opacity-0 lg:block">
          <path data-road-track fill="none" strokeWidth="12" strokeLinecap="round" className="stroke-accent" />
          <path data-road-fill fill="none" strokeWidth="4" strokeLinecap="round" className="stroke-primary" />
          {STATIONS.map((s) => (
            <g key={s.n} data-road-node>
              <circle r="17" className="fill-card stroke-border" strokeWidth="2" />
              <circle data-lit r="17" className="fill-primary stroke-primary" strokeWidth="2" />
              <text textAnchor="middle" dominantBaseline="central" className="fill-primary-foreground text-[13px] font-semibold">
                {s.n}
              </text>
            </g>
          ))}
          <g data-road-marker>
            <polygon points="0,-11 9,-3 6,10 -7,8 -10,-4" className="fill-primary stroke-background" strokeWidth="2" strokeLinejoin="round" />
          </g>
        </svg>

        {/* Mobile and tablet line. */}
        <div aria-hidden className="absolute bottom-0 left-[17px] top-0 w-0.5 bg-border lg:hidden" />
        <div data-rail-fill aria-hidden className="absolute bottom-0 left-[17px] top-0 w-0.5 origin-top bg-primary lg:hidden" />

        <ol className="relative space-y-8 lg:space-y-14">
          {STATIONS.map((s, i) => (
            <StationItem key={s.n} s={s} side={i % 2 === 0 ? "left" : "right"} />
          ))}
        </ol>
      </div>
    </section>
  );
}

"use client";

import { useRef, useState, type RefObject } from "react";
import { Camera, CheckCircle2, FileImage, Mic, PenLine } from "lucide-react";
import { CountUp } from "@/components/motion/count-up";
import { NO_MOTION_QUERY, gsap, inViewport, isBooting, useGSAP } from "@/components/motion/gsap";

/** The six mini demos inside the roadmap cards. Plain divs and text, no images. */

type Tl = gsap.core.Timeline;
const q = (root: HTMLElement, name: string) => Array.from(root.querySelectorAll<HTMLElement>(`[data-d="${name}"]`));

function useStationDemo(root: RefObject<HTMLDivElement | null>, prepare: (r: HTMLElement) => void, build: (r: HTMLElement) => Tl) {
  useGSAP(
    () => {
      const el = root.current;
      const host = el?.closest<HTMLElement>("[data-station]");
      if (!el || !host) return;
      const mm = gsap.matchMedia();
      mm.add(NO_MOTION_QUERY, () => {
        let tl: Tl | null = null;
        const hide = () => {
          tl?.kill();
          tl = null;
          prepare(el);
        };
        const play = () => {
          tl?.kill();
          prepare(el);
          tl = build(el);
        };
        host.addEventListener("station:enter", play);
        host.addEventListener("station:reset", hide);
        if (!(isBooting() && inViewport(host))) hide(); // hidden start state, set just before it is needed
        return () => {
          host.removeEventListener("station:enter", play);
          host.removeEventListener("station:reset", hide);
          tl?.kill();
          // Leave nothing hidden behind if the motion preference flips or the page unmounts.
          const all = [el, ...Array.from(el.querySelectorAll<HTMLElement>("*"))];
          gsap.killTweensOf(all);
          gsap.set(all, { clearProps: "opacity,transform,visibility" });
        };
      });
    },
    { scope: root }
  );
}

const panel = "space-y-3 rounded-lg border bg-gradient-to-b from-accent/60 to-background p-4";
const chip = "inline-flex items-center gap-1 rounded-md border border-transparent px-2 py-0.5 text-xs font-medium";
const cite = "mx-0.5 inline-flex rounded border border-primary/30 bg-primary/10 px-1 align-baseline font-mono text-[11px] font-medium text-primary";

/* 1. A sale happens ------------------------------------------------------------------------------------------- */
export function SaleDemo() {
  const root = useRef<HTMLDivElement>(null);
  useStationDemo(
    root,
    (r) => {
      gsap.set(q(r, "card"), { opacity: 0, y: 18 });
      gsap.set(q(r, "score"), { opacity: 0, scale: 0.5 });
    },
    (r) =>
      gsap
        .timeline()
        .to(q(r, "card"), { opacity: 1, y: 0, duration: 0.45, ease: "power3.out" })
        .to(q(r, "score"), { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(2.2)" }, "+=0.1")
  );
  return (
    <div ref={root} aria-hidden className={panel}>
      <div data-d="card" className="flex items-center justify-between gap-3 rounded-md border bg-card p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">Handloom cotton saree</p>
          <p className="text-xs text-muted-foreground">PayPal checkout · order captured</p>
        </div>
        <p className="shrink-0 font-semibold tabular-nums">$120.00</p>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Readiness score</span>
        <span data-d="score" className={`${chip} bg-destructive/15 text-destructive`}>
          0
        </span>
      </div>
    </div>
  );
}

/* 2. Proof is captured ---------------------------------------------------------------------------------------- */
export function CaptureDemo() {
  const root = useRef<HTMLDivElement>(null);
  useStationDemo(
    root,
    (r) => {
      gsap.set(q(r, "file"), { opacity: 0, x: -28 });
      gsap.set(q(r, "field"), { opacity: 0, y: 8 });
    },
    (r) =>
      gsap
        .timeline()
        .to(q(r, "file"), { opacity: 1, x: 0, duration: 0.45, ease: "power3.out" })
        .to(q(r, "field"), { opacity: 1, y: 0, duration: 0.35, ease: "power3.out", stagger: 0.4 }, "+=0.2")
  );
  const fields = [
    ["Tracking number", "EE123456785IN"],
    ["Carrier", "India Post"],
    ["Ship date", "2026-11-09"],
  ];
  return (
    <div ref={root} aria-hidden className={panel}>
      <div data-d="file" className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm">
        <FileImage className="size-4 text-primary" /> courier-receipt.jpg
        <span className="ml-auto text-xs text-muted-foreground">stored unchanged</span>
      </div>
      <dl className="space-y-1.5">
        {fields.map(([k, v]) => (
          <div key={k} data-d="field" className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-1.5 text-sm">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className={k === "Tracking number" ? "font-mono tabular-nums" : ""}>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Camera className="size-3.5" /> Receipt photo
        </span>
        <span className="inline-flex items-center gap-1">
          <Mic className="size-3.5" /> Voice note
        </span>
        <span className="inline-flex items-center gap-1">
          <PenLine className="size-3.5" /> Typed entry
        </span>
      </p>
    </div>
  );
}

/* 3. Code verifies it ----------------------------------------------------------------------------------------- */
const WRONG = "EE123456789IN";
const RIGHT = "EE123456785IN";

export function VerifyDemo() {
  const root = useRef<HTMLDivElement>(null);
  useStationDemo(
    root,
    (r) => {
      q(r, "typed")[0].textContent = "";
      gsap.set(q(r, "caret"), { opacity: 1 });
      gsap.set([...q(r, "bad"), ...q(r, "good")], { opacity: 0, scale: 0.85 });
    },
    (r) => {
      const typed = q(r, "typed")[0];
      const caret = q(r, "caret");
      const bad = q(r, "bad");
      const good = q(r, "good");
      const p = { i: 0 };
      const text = (src: string) => () => {
        typed.textContent = src.slice(0, Math.round(p.i));
      };
      return gsap
        .timeline()
        .to(caret, { opacity: 0, duration: 0.45, repeat: 3, yoyo: true, ease: "steps(1)" }, 0) // blinking caret
        .to(p, { i: WRONG.length, duration: WRONG.length * 0.07, ease: "none", onUpdate: text(WRONG) }, 0.2)
        .to(bad, { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2)" }, "+=0.15")
        .to(p, { i: 10, duration: 0.45, ease: "none", onUpdate: text(WRONG) }, "+=0.9") // backspace over "9IN"
        .to(bad, { opacity: 0, duration: 0.2 }, "<")
        .to(p, { i: RIGHT.length, duration: 0.4, ease: "none", onUpdate: text(RIGHT) })
        .to(good, { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2)" }, "+=0.1")
        .to(caret, { opacity: 0, duration: 0.2 });
    }
  );
  return (
    <div ref={root} aria-hidden className={panel}>
      <p className="text-xs text-muted-foreground">Tracking number typed in</p>
      <div className="rounded-md border bg-card p-3">
        <p className="font-mono text-base tabular-nums">
          <span data-d="typed">{RIGHT}</span>
          <span data-d="caret" className="ml-0.5 inline-block w-px bg-foreground align-middle opacity-0">
            &nbsp;
          </span>
        </p>
        <div className="mt-2 grid min-h-6">
          <span data-d="bad" className={`${chip} col-start-1 row-start-1 w-fit bg-destructive/15 text-destructive opacity-0`}>
            Rejected: check digit should be 5
          </span>
          <span data-d="good" className={`${chip} col-start-1 row-start-1 w-fit bg-success/15 text-success`}>
            <CheckCircle2 className="size-3" /> Verified
          </span>
        </div>
      </div>
    </div>
  );
}

/* 4. You approve, PayPal is told ------------------------------------------------------------------------------ */
export function ApproveDemo() {
  const root = useRef<HTMLDivElement>(null);
  const [score, setScore] = useState(65); // final value in the HTML; the demo rewinds it to 35 and counts up again
  useStationDemo(
    root,
    (r) => {
      setScore(35);
      gsap.set(q(r, "approval"), { opacity: 0, y: 14 });
      gsap.set(q(r, "filed"), { opacity: 0, y: 8 });
      gsap.set(q(r, "scorerow"), { opacity: 0 });
      gsap.set(q(r, "approve"), { scale: 1 });
    },
    (r) =>
      gsap
        .timeline()
        .to(q(r, "approval"), { opacity: 1, y: 0, duration: 0.45, ease: "power3.out" })
        .to(q(r, "scorerow"), { opacity: 1, duration: 0.3 }, "<0.1")
        .to(q(r, "approve"), { scale: 0.92, duration: 0.12, yoyo: true, repeat: 1, ease: "power2.inOut" }, "+=0.9") // the click
        .to(q(r, "approval"), { opacity: 0.55, duration: 0.3 }, "<0.15")
        .to(q(r, "filed"), { opacity: 1, y: 0, duration: 0.4, ease: "power3.out" }, "<")
        .call(() => setScore(65), undefined, "<0.1") // CountUp counts 35 -> 65
  );
  return (
    <div ref={root} aria-hidden className={panel}>
      <div data-d="approval" className="space-y-3 rounded-md border bg-card p-3">
        <p className="text-sm">
          Add tracking <span className="font-mono tabular-nums">EE123456785IN</span> (India Post) to this sale?
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span data-d="approve" className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">
            Approve
          </span>
          <span className="text-xs text-muted-foreground">Nothing is sent until you do</span>
        </div>
      </div>
      <div data-d="filed" className="flex items-center gap-2 text-sm font-medium text-success">
        <CheckCircle2 className="size-4" /> Tracking filed
      </div>
      <div data-d="scorerow" className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Readiness score</span>
        <span className={`${chip} bg-warning/25 text-foreground`}>
          <CountUp value={score} className="tabular-nums" />
        </span>
      </div>
    </div>
  );
}

/* 5. A dispute arrives ---------------------------------------------------------------------------------------- */
export function DisputeDemo() {
  const root = useRef<HTMLDivElement>(null);
  useStationDemo(
    root,
    (r) => {
      gsap.set(q(r, "opened"), { opacity: 0, y: 10 });
      gsap.set(q(r, "line"), { opacity: 0, y: 8 });
      gsap.set(q(r, "cite"), { opacity: 0, scale: 0.6 });
      gsap.set(q(r, "checks"), { opacity: 0, scale: 0.8 });
      gsap.set(q(r, "send"), { opacity: 0 });
      gsap.set(q(r, "sent"), { opacity: 0, y: 6 });
    },
    (r) => {
      const lines = q(r, "line");
      const cites = q(r, "cite");
      const tl = gsap.timeline().to(q(r, "opened"), { opacity: 1, y: 0, duration: 0.4, ease: "power3.out" });
      lines.forEach((line, i) => {
        tl.to(line, { opacity: 1, y: 0, duration: 0.4, ease: "power3.out" }, i === 0 ? "+=0.3" : "+=0.35");
        tl.to(cites[i], { opacity: 1, scale: 1, duration: 0.25, ease: "back.out(2.5)" }, ">-0.05");
      });
      return tl
        .to(q(r, "checks"), { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2)" }, "+=0.2")
        .to(q(r, "send"), { opacity: 1, duration: 0.25 })
        .to(q(r, "send"), { scale: 0.92, duration: 0.12, yoyo: true, repeat: 1, ease: "power2.inOut" }, "+=0.7") // the click
        .to(q(r, "sent"), { opacity: 1, y: 0, duration: 0.4, ease: "power3.out" }, "<0.15");
    }
  );
  const lines = [
    ["A payment of $120.00 was captured on 2026-11-09", "F1"],
    ["The shipment has tracking number EE123456785IN with India Post", "F2"],
    ["The tracking was filed on 2026-11-10", "F3"],
  ];
  return (
    <div ref={root} aria-hidden className={panel}>
      <div data-d="opened" className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
        <span className="font-medium">Dispute: Item not received</span>
        <span className="text-xs text-muted-foreground">Status read from PayPal</span>
      </div>
      <div className="space-y-1.5 rounded-md border bg-card p-3 text-sm leading-relaxed">
        {lines.map(([t, f]) => (
          <p key={f} data-d="line">
            {t}
            <span data-d="cite" className={cite}>
              [{f}]
            </span>
            .
          </p>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span data-d="checks" className={`${chip} bg-success/15 text-success`}>
          <CheckCircle2 className="size-3" /> Checks passed
        </span>
        <span data-d="send" className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">
          Approve and send
        </span>
      </div>
      <p data-d="sent" className="text-xs text-muted-foreground">
        Sent to PayPal. Status read from PayPal: under review.
      </p>
    </div>
  );
}

/* 6. Limitation? Be ready ------------------------------------------------------------------------------------- */
export function PackDemo() {
  const root = useRef<HTMLDivElement>(null);
  useStationDemo(
    root,
    (r) => {
      gsap.set(q(r, "tile"), { opacity: 0, y: 12 });
      gsap.set(q(r, "gap"), { opacity: 0, x: -10 });
      gsap.set(q(r, "sim"), { opacity: 0, scale: 0.8 });
    },
    (r) =>
      gsap
        .timeline()
        .to(q(r, "tile"), { opacity: 1, y: 0, duration: 0.4, ease: "power3.out", stagger: 0.18 })
        .to(q(r, "gap"), { opacity: 1, x: 0, duration: 0.35, ease: "power3.out", stagger: 0.2 }, "+=0.1")
        .to(q(r, "sim"), { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(2)" }, "+=0.1")
  );
  const tiles = [
    ["7", "sales matched"],
    ["5", "tracking verified"],
    ["2", "gaps listed"],
  ];
  return (
    <div ref={root} aria-hidden className={panel}>
      <div className="grid grid-cols-3 gap-2">
        {tiles.map(([n, l]) => (
          <div key={l} data-d="tile" className="rounded-md border bg-card px-2 py-2 text-center">
            <p className="text-lg font-semibold tabular-nums">{n}</p>
            <p className="text-xs leading-tight text-muted-foreground">{l}</p>
          </div>
        ))}
      </div>
      <ul className="space-y-1 text-xs text-muted-foreground">
        <li data-d="gap">Gap: no delivery proof for the kurta set</li>
        <li data-d="gap">Gap: tracking not filed for the silk dupatta</li>
      </ul>
      <span data-d="sim" className={`${chip} bg-warning/25 font-semibold tracking-wide text-foreground`}>
        SIMULATED in the sandbox
      </span>
    </div>
  );
}

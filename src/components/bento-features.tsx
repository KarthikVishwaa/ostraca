import { CheckCircle2, ExternalLink } from "lucide-react";
import { Reveal } from "@/components/motion/reveal";
import { Stagger } from "@/components/motion/stagger";
import { TiltCard } from "@/components/motion/tilt-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const REPO = "https://github.com/KarthikVishwaa/ostraca";

/** The mini-UI sits at the bottom of the card with rounded top corners. `data-depth` makes it move in parallax when the card tilts. */
function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      aria-hidden
      data-depth="1"
      className={`mx-4 mt-auto rounded-t-xl border border-b-0 bg-gradient-to-b from-accent/70 to-background p-4 pb-5 sm:mx-6 ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

const Title = ({ children }: { children: React.ReactNode }) => <h3 className="px-6 pb-5 text-center text-lg font-semibold tracking-tight">{children}</h3>;
const mono = "font-mono text-sm tabular-nums";

function CaptureDemo() {
  return (
    <Panel>
      <div className="flex items-start justify-between gap-3 text-sm">
        <div className="min-w-0">
          <p className="truncate font-medium">Handloom cotton saree</p>
          <p className="text-xs text-muted-foreground">Sale captured</p>
        </div>
        <p className="shrink-0 font-semibold tabular-nums">120.00 USD</p>
      </div>
      <div className="mt-3 space-y-1">
        <p className="text-xs text-muted-foreground">Tracking number</p>
        <div className={`rounded-md border bg-card px-3 py-2 ${mono}`}>EE123456785IN</div>
      </div>
      <div className="mt-4 space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium">Score 0 → 65</span>
          <span className="text-muted-foreground">of 100</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-primary/20">
          <div className="h-full w-[65%] rounded-full bg-primary" />
        </div>
      </div>
    </Panel>
  );
}

function ChecksDemo() {
  return (
    <Panel>
      <ul className="space-y-3">
        <li className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card px-3 py-2.5">
          <span className={mono}>EE123456789IN</span>
          <Badge className="border-transparent bg-destructive/15 text-destructive">Rejected: check digit should be 5</Badge>
        </li>
        <li className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card px-3 py-2.5">
          <span className={mono}>EE123456785IN</span>
          <Badge variant="success">
            <CheckCircle2 aria-hidden /> Verified
          </Badge>
        </li>
      </ul>
    </Panel>
  );
}

const chip = "mx-0.5 inline-flex rounded border border-primary/30 bg-primary/10 px-1 align-baseline font-mono text-[11px] font-medium text-primary";

function DraftDemo() {
  return (
    <Panel>
      <div className="space-y-2 text-sm leading-relaxed">
        <p>
          A payment of 120.00 USD was captured on 2026-11-09 <span className={chip}>[F1]</span>.
        </p>
        <p>
          The shipment has tracking number EE123456785IN with India Post <span className={chip}>[F2]</span>.
        </p>
        <p>
          The tracking was filed with PayPal on 2026-11-10 <span className={chip}>[F3]</span>.
        </p>
      </div>
      <div className="mt-3">
        <Badge variant="success">
          <CheckCircle2 aria-hidden /> Checks passed
        </Badge>
      </div>
    </Panel>
  );
}

function PackDemo() {
  const tiles = [
    ["7", "sales"],
    ["2", "verified"],
    ["6", "gaps"],
  ];
  return (
    <Panel>
      <div className="grid grid-cols-3 gap-2">
        {tiles.map(([n, label]) => (
          <div key={label} className="rounded-md border bg-card px-2 py-2 text-center">
            <p className="text-lg font-semibold tabular-nums">{n}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
      <div className="mt-3">
        <Badge variant="warning" className="font-semibold tracking-wide">
          SIMULATED
        </Badge>
      </div>
    </Panel>
  );
}

const CARDS = [
  { href: "/ledger", title: "Capture proof", span: "lg:col-span-4", demo: <CaptureDemo /> },
  { href: "/ledger", title: "Code checks, AI suggests", span: "lg:col-span-8", demo: <ChecksDemo /> },
  { href: "/disputes", title: "Answer disputes with cited proof", span: "lg:col-span-8", demo: <DraftDemo /> },
  { href: "/limitation", title: "Limitation pack", span: "lg:col-span-4", demo: <PackDemo /> },
];

/** The home page feature grid: 4/12 + 8/12 over 8/12 + 4/12 on desktop, two columns on tablet, one on mobile. */
export function BentoFeatures() {
  return (
    <section aria-labelledby="bento-heading" className="space-y-6">
      <Reveal className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h2 id="bento-heading" className="text-2xl font-semibold tracking-tight sm:text-3xl">
            What you get
          </h2>
          <p className="text-base text-muted-foreground sm:text-lg">Evidence that is checked, cited and ready before PayPal asks.</p>
        </div>
        <Button asChild variant="outline" className="w-full sm:w-auto">
          <a href={REPO} target="_blank" rel="noopener noreferrer">
            Learn more <ExternalLink aria-hidden />
          </a>
        </Button>
      </Reveal>

      <Stagger className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-12" aria-label="What Ostraca does">
        {CARDS.map((c) => (
          <TiltCard key={c.title} href={c.href} className={`md:col-span-1 ${c.span}`}>
            <Title>{c.title}</Title>
            {c.demo}
          </TiltCard>
        ))}
      </Stagger>
    </section>
  );
}

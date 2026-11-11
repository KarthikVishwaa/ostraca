import Link from "next/link";
import { Check, ExternalLink, X } from "lucide-react";
import { Reveal } from "@/components/motion/reveal";
import { Stagger } from "@/components/motion/stagger";
import { Button } from "@/components/ui/button";
import { ShardMotif } from "./shard-motif";

const REPO = "https://github.com/KarthikVishwaa/ostraca";

export function Hero() {
  return (
    <section className="grid items-center gap-8 pt-2 md:pt-6 lg:grid-cols-2">
      <div className="space-y-5">
        <Reveal className="space-y-4">
          <p className="text-sm font-medium text-primary">AI evidence readiness for PayPal sellers</p>
          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">Prove it before they ask</h1>
          <p className="max-w-xl text-pretty text-base text-muted-foreground sm:text-lg">
            Ostraca keeps AI-checked proof for every PayPal sale, so a dispute or an account limitation never catches you without evidence.
          </p>
        </Reveal>
        <Reveal delay={0.08} className="flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link href="/ledger">Open the ledger</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
            <Link href="/store">Make a test sale</Link>
          </Button>
        </Reveal>
        <p className="border-t pt-3 text-sm text-muted-foreground">Runs on the PayPal sandbox. PayPal decides on disputes and limitations.</p>
      </div>
      <ShardMotif />
    </section>
  );
}

const WITHOUT = ["Proof scattered across chats and photos", "A mistyped tracking number nobody noticed", "A scramble before the deadline", "A reply written from memory"];
const WITH = ["Proof captured at the time of the sale", "Every number checked by code", "A cited reply built from verified facts", "Ready to send, and only after you approve"];

export function BeforeAfter() {
  return (
    <section aria-labelledby="ba-heading" className="space-y-6">
      <h2 id="ba-heading" className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Before and after
      </h2>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border bg-card p-5 sm:p-6">
          <h3 className="font-semibold text-destructive">Without proof ready</h3>
          <Stagger as="ul" className="mt-4 space-y-3">
            {WITHOUT.map((t) => (
              <li key={t} className="flex items-start gap-3 text-sm sm:text-base">
                <X aria-hidden className="mt-0.5 size-5 shrink-0 text-destructive" />
                {t}
              </li>
            ))}
          </Stagger>
        </div>
        <div className="rounded-xl border border-primary/40 bg-gradient-to-b from-accent/50 to-card p-5 sm:p-6">
          <h3 className="font-semibold text-success">With Ostraca</h3>
          <Stagger as="ul" className="mt-4 space-y-3">
            {WITH.map((t) => (
              <li key={t} className="flex items-start gap-3 text-sm sm:text-base">
                <Check aria-hidden className="mt-0.5 size-5 shrink-0 text-success" />
                {t}
              </li>
            ))}
          </Stagger>
        </div>
      </div>
    </section>
  );
}

export function ClosingCta() {
  return (
    <Reveal>
      <section aria-labelledby="cta-heading" className="rounded-xl border bg-gradient-to-b from-accent/60 to-card px-5 py-10 text-center sm:px-10">
        <h2 id="cta-heading" className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Have your proof ready before anyone asks
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-muted-foreground">Make a test sale in the sandbox and watch it go from score 0 to ready.</p>
        <div className="mt-6 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link href="/ledger">Open the ledger</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
            <Link href="/store">Make a test sale</Link>
          </Button>
        </div>
        <a
          href={REPO}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-md text-sm text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          View the code on GitHub <ExternalLink aria-hidden className="size-3.5" />
        </a>
      </section>
    </Reveal>
  );
}

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { HomeDashboard } from "@/components/home-dashboard";
import { Reveal } from "@/components/motion/reveal";

export const metadata = { title: "Proof ledger — Ostraca" };

/** The proof ledger dashboard: every sale and its evidence on the left, summary and next steps on the right. */
export default function LedgerPage() {
  return (
    <div className="space-y-6 md:space-y-8">
      <Reveal className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Proof ledger</h1>
          <p className="text-sm text-muted-foreground">Every PayPal sale and its evidence. Lowest readiness first, so you fix gaps before PayPal asks.</p>
        </div>
        <Button asChild className="w-full sm:w-auto">
          <Link href="/store">Make a test sale</Link>
        </Button>
      </Reveal>

      <HomeDashboard />

      <p className="text-xs text-muted-foreground">
        Ostraca does not control PayPal&apos;s decisions. PayPal decides on holds, disputes and limitations; Ostraca makes
        sure your evidence is complete, correct and fast.
      </p>
    </div>
  );
}

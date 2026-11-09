import Link from "next/link";
import { ShieldCheck, FileSearch, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProofLedger } from "@/components/proof-ledger";

const flows = [
  { icon: ShieldCheck, title: "Capture proof", text: "Photo or voice note → AI reads → code verifies → you approve → tracking filed." },
  { icon: Scale, title: "Answer disputes", text: "Cited draft from your proof. You approve; only then is it sent to PayPal." },
  { icon: FileSearch, title: "Limitation pack", text: "Every sale matched to its proof, gaps flagged, one PDF." },
];

export default function Home() {
  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Prove it before they ask.</p>
          <h1 className="text-3xl font-semibold tracking-tight">Proof ledger</h1>
        </div>
        <Button asChild>
          <Link href="/store">Make a test sale</Link>
        </Button>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        {flows.map((f) => (
          <Card key={f.title} className="gap-3">
            <CardHeader>
              <f.icon className="size-5 text-primary" />
              <CardTitle>{f.title}</CardTitle>
              <CardDescription>{f.text}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Every PayPal sale and its evidence</CardTitle>
          <CardDescription>Lowest readiness first, so you fix gaps before PayPal asks.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProofLedger />
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Ostraca does not control PayPal&apos;s decisions. PayPal decides on holds, disputes and limitations; Ostraca makes
        sure your evidence is complete, correct and fast.
      </p>
    </div>
  );
}

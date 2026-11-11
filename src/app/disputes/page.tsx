import { DisputeList } from "@/components/dispute-list";
import { Reveal } from "@/components/motion/reveal";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const steps = [
  "PayPal reports a dispute. Ostraca reads it and matches it to your sale.",
  "Ostraca drafts a reply from your confirmed proof. Every citation and number is checked by code.",
  "You edit the draft and approve it.",
  "Only then is the evidence sent to PayPal, and only if PayPal allows it right now.",
];

const legend = [
  { label: "open", text: "PayPal has opened the dispute. Look at it soon." },
  { label: "waiting for seller response", text: "It is your turn. Answer before the due date." },
  { label: "waiting for buyer response", text: "You answered. The buyer is next." },
  { label: "under review", text: "PayPal is deciding. Nothing more to send." },
  { label: "resolved", text: "Closed. The outcome is shown on the dispute." },
];

export default function Disputes() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Disputes</h1>
        <p className="text-sm text-muted-foreground">Live from the PayPal sandbox. Open one to see your proof and answer it.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <DisputeList />
        </div>
        <aside className="space-y-6" aria-label="Help">
          <Reveal>
            <Card>
              <CardHeader>
                <CardTitle>How a dispute is answered</CardTitle>
                <CardDescription>You stay in control at every step.</CardDescription>
              </CardHeader>
              <CardContent>
                <ol className="space-y-3 text-sm">
                  {steps.map((s, i) => (
                    <li key={s} className="flex gap-3">
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">{i + 1}</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          </Reveal>
          <Reveal delay={0.08}>
            <Card>
              <CardHeader>
                <CardTitle>Status legend</CardTitle>
                <CardDescription>Straight from PayPal.</CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="space-y-3 text-sm">
                  {legend.map((l) => (
                    <div key={l.label} className="space-y-1">
                      <dt>
                        <Badge variant="secondary">{l.label}</Badge>
                      </dt>
                      <dd className="text-muted-foreground">{l.text}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          </Reveal>
        </aside>
      </div>
    </div>
  );
}

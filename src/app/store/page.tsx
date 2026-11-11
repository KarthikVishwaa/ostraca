import { Lock, ShieldCheck, Truck } from "lucide-react";
import { BrandMark } from "@/components/brand/logo";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PayPalCheckout } from "@/components/paypal-checkout";
import { Reveal } from "@/components/motion/reveal";

const product = {
  name: "Handloom cotton saree",
  seller: "Priya's Looms, Coimbatore (demo seller)",
  price: "120.00",
};

const notes = [
  { icon: Lock, text: "Sandbox money only. Nothing real is charged." },
  { icon: Truck, text: "After paying, add a tracking number on the sale page." },
  { icon: ShieldCheck, text: "The sale lands in your proof ledger straight away." },
];

export default function Store() {
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Badge variant="outline" className="h-auto whitespace-normal py-1">
        Sandbox demo — pay with your sandbox Personal account
      </Badge>
      <div className="grid gap-6 md:grid-cols-5">
        <Reveal className="md:col-span-3">
          <Card className="h-full">
            <CardHeader>
              <div
                aria-hidden
                className="mb-2 grid h-40 place-items-center rounded-lg border bg-accent/60 sm:h-52 [background-image:repeating-linear-gradient(135deg,transparent_0_14px,color-mix(in_oklab,var(--primary)_12%,transparent)_14px_15px)]"
              >
                <BrandMark size={72} />
              </div>
              <CardTitle className="text-xl">{product.name}</CardTitle>
              <CardDescription>{product.seller}</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm">
                {notes.map((n) => (
                  <li key={n.text} className="flex items-start gap-3 text-muted-foreground">
                    <n.icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    {n.text}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </Reveal>
        <Reveal delay={0.08} className="md:col-span-2">
          <Card className="h-full">
            <CardHeader>
              <CardDescription>Total</CardDescription>
              <CardTitle className="text-4xl tabular-nums">${product.price}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* min-h keeps the card steady while the PayPal buttons load. */}
              <div className="min-h-32">
                <PayPalCheckout amount={product.price} description={product.name} />
              </div>
            </CardContent>
          </Card>
        </Reveal>
      </div>
    </div>
  );
}

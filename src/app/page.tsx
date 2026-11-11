import { BentoFeatures } from "@/components/bento-features";
import { Roadmap } from "@/components/home/roadmap";
import { PayPalCredit } from "@/components/brand/paypal-credit";
import { SafetyStrip } from "@/components/home/safety-strip";
import { BeforeAfter, ClosingCta, Hero } from "@/components/home/sections";

/**
 * The explainer. Everything here is in the HTML and fully visible; the animations are added by JavaScript
 * after load. The proof ledger itself lives at /ledger.
 */
export default function Home() {
  return (
    <div className="space-y-16 md:space-y-24">
      <div className="space-y-6">
        <Hero />
        <SafetyStrip />
        <p className="flex items-center gap-3 text-sm text-muted-foreground">
          <PayPalCredit size={40} />
          <span>Built for the PayPal AI Hackathon. Independent project, not affiliated with or endorsed by PayPal.</span>
        </p>
      </div>
      <Roadmap />
      <BeforeAfter />
      <BentoFeatures />
      <ClosingCta />
    </div>
  );
}

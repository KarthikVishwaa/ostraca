import { ExternalLink } from "lucide-react";
import { BrandLogo } from "@/components/brand/logo";
import { PayPalCredit } from "@/components/brand/paypal-credit";

const REPO = "https://github.com/KarthikVishwaa/ostraca";

export function SiteFooter() {
  return (
    <footer className="mt-12 border-t border-border/70 print:hidden">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 text-sm text-muted-foreground sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <BrandLogo size={22} className="text-sm text-foreground" />
          <p className="font-medium text-foreground">Sandbox only. No real money moves and no card or bank details are stored.</p>
          <p>PayPal decides on holds, disputes and limitations. Ostraca prepares the proof.</p>
        </div>
        <a
          href={REPO}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center gap-1.5 self-start rounded-md underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 md:self-auto"
        >
          GitHub repository <ExternalLink className="size-3.5" aria-hidden />
        </a>
      </div>
      <div className="mx-auto flex max-w-7xl flex-col gap-3 border-t border-border/50 px-4 py-5 text-sm text-muted-foreground sm:flex-row sm:items-center sm:gap-4 sm:px-6">
        <PayPalCredit size={44} className="self-start" />
        <div className="space-y-1">
          <p className="font-medium text-foreground">Built with PayPal APIs · runs on the PayPal sandbox</p>
          <p className="text-xs">Ostraca is an independent hackathon project. It is not affiliated with or endorsed by PayPal.</p>
        </div>
      </div>
    </footer>
  );
}

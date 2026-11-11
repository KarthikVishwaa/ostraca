import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { NavProgress } from "@/components/layout/nav-progress";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/site-header";
import { MotionBoot } from "@/components/motion/motion-boot";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

export const metadata: Metadata = {
  // Base for the social-card image URL (opengraph-image.png). APP_URL is the public address, not a secret.
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: "Ostraca — Prove it before they ask",
  description: "AI evidence readiness for PayPal sellers. Built for the PayPal AI Hackathon 2026.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

function HeaderFallback() {
  // Same height as the real header, so nothing jumps when it loads.
  return <div className="sticky top-0 z-40 h-14 border-b border-border/70 bg-background/60 backdrop-blur-md print:hidden" />;
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col overflow-x-clip">
        <TooltipProvider delayDuration={200}>
          <MotionBoot />
          <Suspense fallback={null}>
            <NavProgress />
          </Suspense>
          <Suspense fallback={<HeaderFallback />}>
            <SiteHeader />
          </Suspense>
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 md:py-8 print:max-w-none print:p-0">{children}</main>
          <SiteFooter />
          <Toaster />
        </TooltipProvider>
      </body>
    </html>
  );
}

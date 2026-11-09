import type { Metadata } from "next";
import Link from "next/link";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ostraca — Prove it before they ask",
  description: "AI evidence readiness for PayPal sellers. Built for the PayPal AI Hackathon 2026.",
};

const nav = [
  { href: "/", label: "Proof ledger" },
  { href: "/store", label: "Demo store" },
  { href: "/disputes", label: "Disputes" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <header className="border-b bg-card/60 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="inline-block size-6 rotate-12 rounded-[6px_14px_4px_12px] bg-primary" aria-hidden />
              Ostraca
            </Link>
            <nav className="flex gap-4 text-sm text-muted-foreground">
              {nav.map((n) => (
                <Link key={n.href} href={n.href} className="hover:text-foreground">
                  {n.label}
                </Link>
              ))}
            </nav>
            <span className="ml-auto rounded-md border px-2 py-0.5 text-xs text-muted-foreground">PayPal sandbox</span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
        <Toaster />
      </body>
    </html>
  );
}

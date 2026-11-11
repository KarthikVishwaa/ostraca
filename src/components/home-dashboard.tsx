"use client";

import { useMemo } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, Gavel, PackageCheck, ReceiptText, ShieldCheck, type LucideIcon } from "lucide-react";
import { CountUp } from "@/components/motion/count-up";
import { Reveal } from "@/components/motion/reveal";
import { Stagger } from "@/components/motion/stagger";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataBoundary } from "@/components/motion/data-boundary";
import { NextStepsSkeleton, SummaryTilesSkeleton } from "@/components/skeletons";
import type { Transaction } from "@/db/schema";
import { formatText } from "@/lib/format";
import type { DisputeListItem } from "./dispute-types";
import { ProofLedger } from "./proof-ledger";
import { usePolled } from "./use-polled";

const SALES_MS = 12_000;
// The disputes route re-reads PayPal on every call, so the sidebar polls it less often than the ledger.
const DISPUTES_MS = 30_000;

type Tile = { label: string; icon: LucideIcon; value: number | null; decimals?: number; suffix?: string; hint: string };

function SummaryTile({ tile }: { tile: Tile }) {
  const Icon = tile.icon;
  return (
    <div className="rounded-lg border bg-card/60 p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" aria-hidden /> {tile.label}
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums">
        {tile.value === null ? <span className="text-muted-foreground">–</span> : <CountUp value={tile.value} decimals={tile.decimals} suffix={tile.suffix} />}
      </p>
      <p className="text-xs text-muted-foreground">{tile.hint}</p>
    </div>
  );
}

/** Ledger on the left, portfolio summary and next steps on the right (stacked on small screens). */
export function HomeDashboard() {
  const sales = usePolled<Transaction[]>("/api/transactions", SALES_MS);
  const disputes = usePolled<DisputeListItem[]>("/api/disputes", DISPUTES_MS);
  const rows = sales.data;
  const list = disputes.data;

  const summary = useMemo(() => {
    if (!rows) return null;
    const avg = rows.length ? rows.reduce((n, r) => n + r.readinessScore, 0) / rows.length : 0;
    const lowest = rows.length ? rows.reduce((a, b) => (b.readinessScore < a.readinessScore ? b : a)) : null;
    return { count: rows.length, avg: Math.round(avg), filed: rows.filter((r) => r.trackingFiled).length, lowest };
  }, [rows]);

  const open = useMemo(() => (list ? list.filter((d) => d.status !== "RESOLVED") : null), [list]);

  const tiles: Tile[] = [
    { label: "Sales", icon: ReceiptText, value: summary?.count ?? null, hint: "captured from PayPal" },
    { label: "Avg readiness", icon: ShieldCheck, value: summary ? summary.avg : null, suffix: "/100", hint: "across all sales" },
    { label: "Tracking filed", icon: PackageCheck, value: summary?.filed ?? null, hint: summary ? `of ${summary.count} sales` : "of your sales" },
    { label: "Open disputes", icon: Gavel, value: open ? open.length : null, hint: disputes.error && !list ? "could not read PayPal" : "not yet resolved" },
  ];

  const lowest = summary?.lowest;
  const todo: Array<{ key: string; done: boolean; text: string; href: string; cta: string }> = [];
  if (summary) {
    todo.push(
      lowest && lowest.readinessScore < 100
        ? { key: "proof", done: false, text: `Add proof to ${formatText(lowest.itemDescription, "your lowest-scoring sale")} (readiness ${lowest.readinessScore})`, href: `/sales/${lowest.id}`, cta: "Open sale" }
        : { key: "proof", done: true, text: summary.count ? "Every sale is fully documented" : "Make a test sale to start your ledger", href: summary.count ? "/ledger" : "/store", cta: summary.count ? "" : "Open store" }
    );
  }
  if (open) {
    todo.push(
      open.length
        ? { key: "disputes", done: false, text: `Answer ${open.length} open dispute${open.length === 1 ? "" : "s"}`, href: open.length === 1 ? `/disputes/${open[0].id}` : "/disputes", cta: "View disputes" }
        : { key: "disputes", done: true, text: "No open disputes", href: "/disputes", cta: "" }
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Reveal className="lg:col-span-2">
        <Card className="h-full">
          <CardHeader>
            <CardTitle>Every PayPal sale and its evidence</CardTitle>
            <CardDescription>Lowest readiness first, so you fix gaps before PayPal asks.</CardDescription>
          </CardHeader>
          <CardContent>
            <ProofLedger rows={rows} error={sales.error} refresh={sales.refresh} />
          </CardContent>
        </Card>
      </Reveal>

      <aside className="space-y-6" aria-label="Portfolio summary">
        <Reveal delay={0.08}>
          <Card>
            <CardHeader>
              <CardTitle>Portfolio summary</CardTitle>
              <CardDescription>Counted by code from your records.</CardDescription>
            </CardHeader>
            <CardContent>
              <DataBoundary ready={!!summary || !!sales.error} skeleton={<SummaryTilesSkeleton />}>
                <div className="grid grid-cols-2 gap-3">
                  {tiles.map((t) => (
                    <SummaryTile key={t.label} tile={t} />
                  ))}
                </div>
              </DataBoundary>
            </CardContent>
          </Card>
        </Reveal>

        <Reveal delay={0.14}>
          <Card>
            <CardHeader>
              <CardTitle>What to do next</CardTitle>
              <CardDescription>The two things that protect you most.</CardDescription>
            </CardHeader>
            <CardContent>
              <DataBoundary ready={todo.length > 0 || !!sales.error} skeleton={<NextStepsSkeleton />}>
                <Stagger as="ul" className="space-y-3">
                  {todo.map((t) => (
                    <li key={t.key} className="flex items-start gap-3 text-sm">
                      {t.done ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden /> : <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />}
                      <div className="min-w-0">
                        <p className={t.done ? "text-muted-foreground" : "font-medium"}>{t.text}</p>
                        {t.cta && (
                          <Link href={t.href} className="inline-flex min-h-11 items-center text-primary underline-offset-4 hover:underline md:min-h-6">
                            {t.cta}
                          </Link>
                        )}
                      </div>
                    </li>
                  ))}
                </Stagger>
              </DataBoundary>
            </CardContent>
          </Card>
        </Reveal>
      </aside>
    </div>
  );
}

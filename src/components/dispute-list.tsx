"use client";

import Link from "next/link";
import { Gavel } from "lucide-react";
import { Stagger } from "@/components/motion/stagger";
import { Button } from "@/components/ui/button";
import { DataBoundary } from "@/components/motion/data-boundary";
import { DisputeListSkeleton } from "@/components/skeletons";
import { ReadinessChip } from "./readiness-chip";
import { formatMoney, formatText, shortDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { statusLabel, type DisputeListItem } from "./dispute-types";
import { usePolled } from "./use-polled";

export function DisputeList() {
  const { data, error, updatedAt } = usePolled<DisputeListItem[]>("/api/disputes");

  return (
    <DataBoundary ready={!!data || !!error} skeleton={<DisputeListSkeleton />}>
    <div className="space-y-4">
      {error && <p role="alert" className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">Could not read disputes from PayPal: {error}</p>}
      {data && data.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-accent text-primary">
            <Gavel className="size-6" aria-hidden />
          </span>
          <div className="space-y-1">
            <p className="font-medium">No disputes yet</p>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              Log in to sandbox.paypal.com as your Personal (buyer) account and report a problem on a test payment. It shows up here.
            </p>
          </div>
          <Button asChild className="w-full sm:w-auto">
            <Link href="/store">Make a test sale</Link>
          </Button>
        </div>
      )}
      <Stagger className="grid gap-4">
        {data?.map((d) => (
          <Link key={d.id} href={`/disputes/${d.id}`} className="block min-h-11 rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
            <Card className="lift gap-3 transition-colors hover:bg-accent/40">
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 font-mono text-sm">
                  <span className="break-all">{d.id}</span>
                  <Badge variant="secondary">{statusLabel(d.status)}</Badge>
                  {d.stage && <Badge variant="outline">{statusLabel(d.stage)}</Badge>}
                </CardTitle>
                <CardDescription>
                  {statusLabel(d.reason)} · {formatMoney(d.amount?.value, d.amount?.currency_code)}
                  {d.created ? ` · opened ${shortDate(d.created)}` : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="text-xs">
                {d.sale ? (
                  <span>
                    Sale: {formatText(d.sale.item, "Sale")} · readiness <ReadinessChip score={d.sale.readinessScore} withWord={false} />
                  </span>
                ) : (
                  <span className="text-muted-foreground">No matching sale</span>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </Stagger>
      <p className="text-xs text-muted-foreground">
        Status and stage come straight from PayPal and refresh every 10 seconds{updatedAt ? ` (last read ${updatedAt.toLocaleTimeString()})` : ""}.
      </p>
    </div>
    </DataBoundary>
  );
}

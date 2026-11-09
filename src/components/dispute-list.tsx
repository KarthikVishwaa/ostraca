"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { statusLabel, type DisputeListItem } from "./dispute-types";
import { usePolled } from "./use-polled";

export function DisputeList() {
  const { data, error, updatedAt } = usePolled<DisputeListItem[]>("/api/disputes");

  if (!data && !error) return <p className="text-sm text-muted-foreground">Loading disputes from PayPal…</p>;
  return (
    <div className="space-y-4">
      {error && <p className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">Could not read disputes from PayPal: {error}</p>}
      {data && data.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No disputes yet. Log in to sandbox.paypal.com as your Personal (buyer) account and report a problem on a test payment.
        </p>
      )}
      <div className="grid gap-4">
        {data?.map((d) => (
          <Link key={d.id} href={`/disputes/${d.id}`} className="block rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
            <Card className="gap-3 transition-colors hover:bg-accent/40">
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 font-mono text-sm">
                  {d.id}
                  <Badge variant="secondary">{statusLabel(d.status)}</Badge>
                  {d.stage && <Badge variant="outline">{statusLabel(d.stage)}</Badge>}
                </CardTitle>
                <CardDescription>
                  {statusLabel(d.reason)} · {d.amount?.value} {d.amount?.currency_code}
                  {d.created ? ` · opened ${new Date(d.created).toLocaleDateString()}` : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="text-xs">
                {d.sale ? (
                  <span>
                    Sale: {d.sale.item ?? "Sale"} · readiness <Badge variant={d.sale.readinessScore >= 80 ? "success" : d.sale.readinessScore >= 50 ? "warning" : "destructive"}>{d.sale.readinessScore}</Badge>
                  </span>
                ) : (
                  <span className="text-muted-foreground">No matching sale</span>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Status and stage come straight from PayPal and refresh every 10 seconds{updatedAt ? ` (last read ${updatedAt.toLocaleTimeString()})` : ""}.
      </p>
    </div>
  );
}

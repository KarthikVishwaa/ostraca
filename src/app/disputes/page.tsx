import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listDisputes } from "@/lib/paypal/disputes";
import { hasLink } from "@/lib/paypal/client";
import { Suspense } from "react";
import { connection } from "next/server";

export default function Disputes() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Disputes</h1>
        <p className="text-sm text-muted-foreground">Live from the PayPal sandbox. Actions appear only when PayPal allows them.</p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading disputes from PayPal…</p>}>
        <DisputeList />
      </Suspense>
    </div>
  );
}

async function DisputeList() {
  await connection(); // always fetch live, never cache
  let items: Awaited<ReturnType<typeof listDisputes>>["items"] = [];
  let error: string | null = null;
  try {
    items = (await listDisputes()).items ?? [];
  } catch (e) {
    error = (e as Error).message;
  }

  return (
    <>
      {error && <p className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">{error}</p>}
      {!error && items.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No disputes yet. Log in to sandbox.paypal.com as your Personal (buyer) account and report a problem on a test payment.
        </p>
      )}
      <div className="grid gap-4">
        {items.map((d) => (
          <Card key={d.dispute_id} className="gap-3">
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2 font-mono text-sm">
                {d.dispute_id}
                <Badge variant="secondary">{d.status}</Badge>
                {d.dispute_life_cycle_stage && <Badge variant="outline">{d.dispute_life_cycle_stage}</Badge>}
              </CardTitle>
              <CardDescription>
                {d.reason} · {d.dispute_amount?.value} {d.dispute_amount?.currency_code}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2 text-xs">
              {hasLink(d.links, "provide_evidence") ? (
                <Badge variant="success">Evidence can be submitted</Badge>
              ) : (
                <Badge variant="outline">Evidence not open yet</Badge>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}

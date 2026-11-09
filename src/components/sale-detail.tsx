"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Circle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { EvidenceCard } from "./evidence-card";
import { EvidenceUpload } from "./evidence-upload";
import { ManualEntryForm } from "./manual-entry-form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrackingApproval } from "./tracking-approval";
import { api, type SaleDTO } from "./sale-types";

const EVENT_LABEL: Record<string, string> = {
  "transaction.captured": "Sale captured",
  "evidence.uploaded": "Evidence uploaded",
  "evidence.extracted": "AI suggested fields",
  "evidence.ai_unavailable": "AI unavailable, manual entry",
  "field.confirmed": "You confirmed a field",
  "field.edited": "You edited a field",
  "field.entered": "You entered a field",
  "action.proposed": "Tracking request queued",
  "action.approved": "You approved the request",
  "action.rejected": "You rejected the request",
  "action.executed": "PayPal accepted it",
  "action.failed": "PayPal request failed",
  "tracking.filed": "Tracking filed",
  "evidence.reused": "Already in your proof record (reused)",
  "field.rejected_by_check": "A value failed the checks",
  "action.requeued": "You re-queued the request",
  "action.superseded": "Replaced by a newer tracking number",
};

function detailText(d: unknown) {
  if (!d || typeof d !== "object") return "";
  const o = d as Record<string, unknown>;
  const bits = [o.field && `field: ${o.field}`, o.to && `value: ${o.to}`, o.check && `check: ${o.check}`, o.fileName && String(o.fileName), o.reason && `reason: ${o.reason}`, o.error && `error: ${o.error}`];
  return bits.filter(Boolean).join(" · ");
}

export function SaleDetail({ id }: { id: string }) {
  const [sale, setSale] = useState<SaleDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<SaleDTO>(`/api/transactions/${id}`).then(setSale, (e) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);

  if (error) return <p className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">Could not load this sale: {error}</p>;
  if (!sale) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const t = sale.transaction;
  const tone = sale.readiness.level === "ready" ? "success" : sale.readiness.level === "partial" ? "warning" : "destructive";
  return (
    <div className="space-y-6">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Proof ledger
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t.itemDescription ?? "Sale"}</h1>
          <p className="text-sm text-muted-foreground">
            {t.amount} {t.currency} · {t.buyerName ?? "Unknown buyer"}
            {t.shipToCity ? ` · ${t.shipToCity}` : " · no ship-to city from PayPal"} · captured {new Date(t.capturedAt).toLocaleDateString()} · <span className="font-mono">{t.paypalCaptureId}</span>
          </p>
        </div>
        <Badge variant={tone}>Readiness {sale.readiness.score}/100</Badge>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>1. Add proof</CardTitle>
              <CardDescription>AI only suggests. Code checks each value. You decide what counts.</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue={sale.ai.claude ? "upload" : "manual"}>
                <TabsList>
                  <TabsTrigger value="upload">Upload a file</TabsTrigger>
                  <TabsTrigger value="manual">Type it in</TabsTrigger>
                </TabsList>
                <TabsContent value="upload" className="pt-3">
                  <EvidenceUpload transactionId={id} ai={sale.ai} onDone={load} />
                </TabsContent>
                <TabsContent value="manual" className="pt-3">
                  <ManualEntryForm transactionId={id} onDone={load} />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <section className="space-y-4" aria-label="Evidence">
            <h2 className="text-lg font-semibold">2. Review what was found</h2>
            {sale.evidence.length ? (
              sale.evidence.map((e) => <EvidenceCard key={e.id} item={e} onChanged={load} />)
            ) : (
              <p className="text-sm text-muted-foreground">No evidence yet. Upload a file above.</p>
            )}
          </section>

          <Card>
            <CardHeader>
              <CardTitle>3. Approve and file tracking</CardTitle>
              <CardDescription>Sent to PayPal sandbox only after you approve.</CardDescription>
            </CardHeader>
            <CardContent>
              <TrackingApproval sale={sale} onChanged={load} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Readiness score</CardTitle>
              <CardDescription>Unconfirmed &quot;needs review&quot; fields do not count.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Progress value={sale.readiness.score} aria-label="Readiness score" />
              <ul className="space-y-2 text-sm">
                {sale.readiness.checks.map((c) => (
                  <li key={c.key} className="flex items-start gap-2">
                    {c.passed ? <CheckCircle2 className="mt-0.5 size-4 text-success" /> : <Circle className="mt-0.5 size-4 text-muted-foreground" />}
                    <span className={c.passed ? "" : "text-muted-foreground"}>{c.label}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{c.weight}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
              <CardDescription>Every step is logged.</CardDescription>
            </CardHeader>
            <CardContent>
              {sale.activity.length ? (
                <ol className="space-y-3">
                  {sale.activity.map((a) => (
                    <li key={a.id} className="text-sm">
                      <p>{EVENT_LABEL[a.event] ?? a.event}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(a.createdAt).toLocaleString()} · {a.actor}
                      </p>
                      {detailText(a.details) && <p className="break-words text-xs text-muted-foreground">{detailText(a.details)}</p>}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">Nothing yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Sandbox only. No card or bank details are stored.</p>
    </div>
  );
}

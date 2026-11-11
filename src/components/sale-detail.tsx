"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Circle, FileQuestion } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataBoundary } from "@/components/motion/data-boundary";
import { SaleSkeleton } from "@/components/skeletons";
import { Stagger } from "@/components/motion/stagger";
import { Reveal } from "@/components/motion/reveal";
import { dateTime, formatMoney, formatText, shortDate } from "@/lib/format";
import { ScoreRing } from "./score-ring";
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

  return (
    <DataBoundary ready={!!sale || !!error} skeleton={<SaleSkeleton />}>
      {error ? (
        <p role="alert" className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">Could not load this sale: {error}</p>
      ) : sale ? (
        <SaleView sale={sale} id={id} load={load} />
      ) : null}
    </DataBoundary>
  );
}

function SaleView({ sale, id, load }: { sale: SaleDTO; id: string; load: () => void }) {
  const t = sale.transaction;
  const tone = sale.readiness.level === "ready" ? "success" : sale.readiness.level === "partial" ? "warning" : "destructive";
  return (
    <div className="space-y-6">
      <Link href="/ledger" className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground md:min-h-0">
        <ArrowLeft className="size-4" /> Proof ledger
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight break-words">{formatText(t.itemDescription, "Sale")}</h1>
          <p className="text-sm text-muted-foreground break-words">
            {formatMoney(t.amount, t.currency)} · {formatText(t.buyerName, "Unknown buyer")}
            {t.shipToCity?.trim() ? ` · ${t.shipToCity.trim()}` : " · no ship-to city from PayPal"} · captured {shortDate(t.capturedAt)} · <span className="font-mono break-all">{t.paypalCaptureId}</span>
          </p>
        </div>
        <Badge variant={tone}>Readiness {sale.readiness.score}/100</Badge>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Reveal>
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
          </Reveal>

          <section className="space-y-4" aria-label="Evidence">
            <h2 className="text-lg font-semibold">2. Review what was found</h2>
            {sale.evidence.length ? (
              <Stagger className="space-y-4">
                {sale.evidence.map((e) => (
                  <EvidenceCard key={e.id} item={e} onChanged={load} />
                ))}
              </Stagger>
            ) : (
              <div className="flex items-center gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                <FileQuestion className="size-5 shrink-0" aria-hidden />
                No evidence yet. Upload a file or type the details in above.
              </div>
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

        {/* Sticky on wide screens; scrolls on its own if it is ever taller than the window. */}
        <div className="space-y-6 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:self-start lg:overflow-y-auto lg:pb-1 lg:pr-1">
          <Reveal delay={0.06}>
            <Card>
              <CardHeader>
                <CardTitle>Readiness score</CardTitle>
                <CardDescription>Unconfirmed &quot;needs review&quot; fields do not count.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-center">
                  <ScoreRing score={sale.readiness.score} level={sale.readiness.level} />
                </div>
                <Stagger as="ul" className="space-y-2 text-sm" aria-label="Score breakdown">
                  {sale.readiness.checks.map((c) => (
                    <li key={c.key} className="flex items-start gap-2">
                      {c.passed ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-label="Passed" /> : <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="Not yet" />}
                      <span className={c.passed ? "" : "text-muted-foreground"}>{c.label}</span>
                      <span className="ml-auto text-xs tabular-nums text-muted-foreground">{c.weight}</span>
                    </li>
                  ))}
                </Stagger>
              </CardContent>
            </Card>
          </Reveal>

          <Reveal delay={0.12}>
            <Card>
              <CardHeader>
                <CardTitle>Activity</CardTitle>
                <CardDescription>Every step is logged.</CardDescription>
              </CardHeader>
              <CardContent>
                {sale.activity.length ? (
                  <Stagger as="ol" className="max-h-72 space-y-3 overflow-y-auto pr-1">
                    {sale.activity.map((a) => (
                      <li key={a.id} className="text-sm">
                        <p>{EVENT_LABEL[a.event] ?? a.event}</p>
                        <p className="text-xs text-muted-foreground">
                          {dateTime(a.createdAt)} · {formatText(a.actor)}
                        </p>
                        {detailText(a.details) && <p className="break-words text-xs text-muted-foreground">{detailText(a.details)}</p>}
                      </li>
                    ))}
                  </Stagger>
                ) : (
                  <p className="text-sm text-muted-foreground">Nothing yet.</p>
                )}
              </CardContent>
            </Card>
          </Reveal>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Sandbox only. No card or bank details are stored.</p>
    </div>
  );
}

"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { DisputeApproval } from "./dispute-approval";
import { DraftPanel } from "./dispute-draft";
import { SandboxBox } from "./dispute-sandbox";
import { statusLabel, type DisputeView } from "./dispute-types";
import { usePolled } from "./use-polled";

const EVENT_LABEL: Record<string, string> = {
  "dispute.synced": "First read from PayPal",
  "dispute.updated": "PayPal status changed",
  "dispute.draft_generated": "Draft written",
  "dispute.draft_queued": "Draft queued for approval",
  "dispute.evidence_blocked": "PayPal did not allow evidence, nothing sent",
  "dispute.evidence_submitted": "Evidence sent to PayPal",
  "dispute.sandbox_step": "Sandbox step",
  "action.proposed": "Request queued",
  "action.approved": "You approved it",
  "action.rejected": "You rejected it",
  "action.requeued": "You re-queued it",
  "action.superseded": "Replaced by a newer draft",
  "action.executed": "PayPal accepted it",
  "action.failed": "PayPal request failed",
};

function detailText(d: unknown) {
  if (!d || typeof d !== "object") return "";
  const o = d as Record<string, unknown>;
  return [o.status && `status: ${o.status}`, o.stage && `stage: ${o.stage}`, o.step && `step: ${o.step}`, o.result && String(o.result), o.error && `error: ${o.error}`, o.debug_id && `debug_id: ${o.debug_id}`, o.source && `source: ${o.source}`]
    .filter(Boolean)
    .join(" · ");
}

export function DisputeDetail({ id }: { id: string }) {
  const { data: v, error, updatedAt, refresh } = usePolled<DisputeView>(`/api/disputes/${id}`);

  if (!v) {
    return error ? (
      <p className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">Could not read this dispute from PayPal: {error}</p>
    ) : (
      <p className="text-sm text-muted-foreground">Reading the dispute from PayPal…</p>
    );
  }

  const d = v.dispute;
  return (
    <div className="space-y-6">
      <Link href="/disputes" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Disputes
      </Link>

      <header className="space-y-1">
        <h1 className="flex flex-wrap items-center gap-2 font-mono text-2xl font-semibold tracking-tight">
          {d.id}
          <Badge variant="secondary">{statusLabel(d.status)}</Badge>
          {d.stage && <Badge variant="outline">{statusLabel(d.stage)}</Badge>}
        </h1>
        <p className="text-sm text-muted-foreground">
          Status is read from PayPal and refreshes every 10 seconds{updatedAt ? ` (last read ${updatedAt.toLocaleTimeString()})` : ""}.
        </p>
        {error && <p className="text-sm text-destructive">Showing the last good read. Latest refresh failed: {error}</p>}
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>The dispute</CardTitle>
              <CardDescription>
                {statusLabel(d.reason)} · {d.amount?.value} {d.amount?.currency_code}
                {d.due ? ` · you must respond by ${new Date(d.due).toLocaleDateString()}` : ""}
                {d.outcome ? ` · outcome: ${statusLabel(d.outcome)}` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {d.messages.length ? (
                d.messages.map((m, i) => (
                  <div key={i} className="rounded-md bg-muted p-3 text-sm">
                    <p className="text-xs text-muted-foreground">
                      {m.by.toLowerCase()} · {new Date(m.time).toLocaleString()}
                    </p>
                    <p className="whitespace-pre-wrap break-words">{m.content}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No buyer message.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Your response</CardTitle>
              <CardDescription>AI only suggests. Code checks every citation and number. You edit and approve.</CardDescription>
            </CardHeader>
            <CardContent>
              <DraftPanel view={v} onQueued={refresh} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Approval</CardTitle>
              <CardDescription>Evidence goes to PayPal only after you approve, and only if PayPal allows it right now.</CardDescription>
            </CardHeader>
            <CardContent>
              <DisputeApproval view={v} onChanged={refresh} />
            </CardContent>
          </Card>

          {v.sandbox && <SandboxBox view={v} onChanged={refresh} />}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Linked sale</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {v.sale ? (
                <>
                  <p>
                    <Link href={`/sales/${v.sale.id}`} className="font-medium underline underline-offset-2">
                      {v.sale.item ?? "Sale"}
                    </Link>
                    <br />
                    <span className="text-muted-foreground">
                      {v.sale.amount} {v.sale.currency} · {v.sale.buyer ?? "unknown buyer"}
                    </span>
                  </p>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Readiness {v.sale.readinessScore}/100</p>
                    <Progress value={v.sale.readinessScore} aria-label="Readiness score" />
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground">No matching sale. Ostraca matches the dispute&apos;s seller transaction to a sale it has captured.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Evidence on file</CardTitle>
            </CardHeader>
            <CardContent>
              {v.evidence.length ? (
                <ul className="space-y-3 text-sm">
                  {v.evidence.map((e) => (
                    <li key={e.id}>
                      <p className="break-words">{e.fileName}</p>
                      <p className="text-xs text-muted-foreground">
                        {e.kind.replace(/_/g, " ")} · SHA-256 <span className="font-mono">{e.sha256.slice(0, 10)}…</span>
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {e.usedFor.length ? e.usedFor.map((u) => <Badge key={u} variant="success">{u}</Badge>) : <span className="text-xs text-muted-foreground">not confirmed yet</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No evidence yet. Add proof on the sale page.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
              <CardDescription>Every step is logged.</CardDescription>
            </CardHeader>
            <CardContent>
              {v.activity.length ? (
                <ol className="space-y-3">
                  {v.activity.map((a) => (
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
      <p className="text-xs text-muted-foreground">
        Sandbox only. Ostraca does not control PayPal&apos;s decision; it makes sure your evidence is complete, correct and on time.
      </p>
    </div>
  );
}

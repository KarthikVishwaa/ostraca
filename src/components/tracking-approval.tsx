"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api, type ActionDTO, type SaleDTO } from "./sale-types";

const FILED_MESSAGE = "Tracking filed. PayPal usually releases holds about 24h after delivery.";

/**
 * The approval step. "Request approval" only queues a pending action; PayPal is called
 * only when the seller presses "Approve and file tracking".
 */
export function TrackingApproval({ sale, onChanged }: { sale: SaleDTO; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const filed = !!sale.transaction.trackingFiled;
  const pending = sale.actions.find((a) => a.type === "add_tracking" && (a.status === "pending" || a.status === "failed"));
  const hasTracking = sale.evidence.some((e) => e.fields.some((f) => f.field === "tracking_number" && f.counted));

  async function run(label: string, fn: () => Promise<unknown>, success?: string) {
    setBusy(true);
    try {
      await fn();
      if (success) toast.success(success);
    } catch (e) {
      toast.error(`${label}: ${(e as Error).message}`);
    } finally {
      setBusy(false);
      onChanged();
    }
  }

  if (filed) return <p className="rounded-md border border-success/40 bg-success/10 p-3 text-sm">{FILED_MESSAGE}</p>;

  if (pending) return <PendingAction action={pending} busy={busy} run={run} />;

  return (
    <div className="space-y-2">
      <Button
        disabled={!hasTracking || busy}
        onClick={() => run("Could not queue", () => api(`/api/transactions/${sale.transaction.id}/actions`, { method: "POST" }))}
      >
        <Send /> Request approval to file tracking
      </Button>
      <p className="text-xs text-muted-foreground">
        {hasTracking
          ? "This only queues the request. Nothing goes to PayPal until you approve it."
          : "Needs a verified or confirmed tracking number first."}
      </p>
    </div>
  );
}

function PendingAction({
  action,
  busy,
  run,
}: {
  action: ActionDTO;
  busy: boolean;
  run: (label: string, fn: () => Promise<unknown>, success?: string) => Promise<void>;
}) {
  const p = action.payload;
  return (
    <div className="space-y-3 rounded-md border p-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Ready to file with PayPal</span>
        <Badge variant={action.status === "failed" ? "destructive" : "warning"}>{action.status}</Badge>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Will file</dt>
        <dd className="font-mono">{p.trackingNumber}</dd>
        <dt className="text-muted-foreground">Carrier</dt>
        <dd>{p.carrierNameOther ?? p.carrier}</dd>
        <dt className="text-muted-foreground">Capture</dt>
        <dd className="font-mono">{p.captureId}</dd>
      </dl>
      {action.error && <p className="text-sm text-destructive">Last attempt failed: {action.error}</p>}
      <div className="flex gap-2">
        <Button disabled={busy} onClick={() => run("Approval failed", () => api(`/api/actions/${action.id}/approve`, { method: "POST" }), FILED_MESSAGE)}>
          {action.status === "failed" ? "Approve and retry" : "Approve and file tracking"}
        </Button>
        {action.status === "pending" && (
          <Button variant="outline" disabled={busy} onClick={() => run("Reject failed", () => api(`/api/actions/${action.id}/reject`, { method: "POST" }), "Request rejected. Nothing was sent to PayPal.")}>
            Reject
          </Button>
        )}
      </div>
    </div>
  );
}

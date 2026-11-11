"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TaskProgress } from "@/components/ui/task-progress";
import { requestStream } from "@/lib/api-client";
import { api, type ActionDTO, type SaleDTO } from "./sale-types";
import { useStagedTask } from "./use-staged-task";

const FILED_MESSAGE = "Tracking filed. PayPal usually releases holds about 24h after delivery.";

/**
 * The approval step. "Request approval" only queues a pending action; PayPal is called only when the
 * seller presses "Approve and file tracking".
 */
export function TrackingApproval({ sale, onChanged }: { sale: SaleDTO; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const task = useStagedTask<unknown>();
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

  async function approve(action: ActionDTO) {
    const r = await task.run((report) => requestStream(`/api/actions/${action.id}/approve`, { method: "POST" }, report));
    if (!r) return;
    if (r.ok) toast.success(FILED_MESSAGE);
    else toast.error(`Approval failed: ${r.error.message}${r.error.debugId ? ` (PayPal debug_id: ${r.error.debugId})` : ""}`);
    onChanged();
  }

  if (pending)
    return (
      <div className="space-y-3">
        <PendingAction action={pending} busy={busy || task.running} run={run} approve={approve} />
        <TaskProgress state={task.state} onRetry={task.retry} onDismiss={task.reset} title="Filing tracking with PayPal" />
      </div>
    );

  return (
    <div className="space-y-2">
      <Button
        className="w-full sm:w-auto"
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
  approve,
}: {
  action: ActionDTO;
  busy: boolean;
  run: (label: string, fn: () => Promise<unknown>, success?: string) => Promise<void>;
  approve: (a: ActionDTO) => Promise<void>;
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
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button className="w-full sm:w-auto" disabled={busy} onClick={() => approve(action)}>
          {action.status === "failed" ? "Approve and retry" : "Approve and file tracking"}
        </Button>
        {action.status === "pending" && (
          <Button className="w-full sm:w-auto" variant="outline" disabled={busy} onClick={() => run("Reject failed", () => api(`/api/actions/${action.id}/reject`, { method: "POST" }), "Request rejected. Nothing was sent to PayPal.")}>
            Reject
          </Button>
        )}
      </div>
    </div>
  );
}

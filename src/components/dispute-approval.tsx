"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TaskProgress } from "@/components/ui/task-progress";
import { requestStream } from "@/lib/api-client";
import { api } from "./sale-types";
import { useStagedTask } from "./use-staged-task";
import { statusLabel, type DisputeView, type EvidenceAction } from "./dispute-types";

/** The approval step. Approve is the only thing that can make Ostraca contact PayPal about this dispute. */
export function DisputeApproval({ view, onChanged }: { view: DisputeView; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const open = view.actions.find((a) => a.status === "pending" || a.status === "failed");
  const sent = view.actions.find((a) => a.status === "executed");
  const task = useStagedTask<unknown>();

  // Approve is the slow, important step: real stages (re-reading from PayPal, sending, reading the new status).
  async function approve(action: EvidenceAction) {
    const r = await task.run((report) => requestStream(`/api/actions/${action.id}/approve`, { method: "POST" }, report));
    if (!r) return; // already running
    if (r.ok) toast.success("Evidence sent to PayPal. Waiting for PayPal's status.");
    else toast.error(r.error.message + (r.error.debugId ? ` (PayPal debug_id: ${r.error.debugId})` : "")); // PayPal's own message
    onChanged();
  }

  async function run(fn: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(success);
    } catch (e) {
      toast.error((e as Error).message); // PayPal's own message and debug_id when it refused
    } finally {
      setBusy(false);
      onChanged();
    }
  }

  return (
    <div className="space-y-4">
      {open ? <Pending action={open} view={view} busy={busy || task.running} run={run} approve={approve} /> : !sent && <p className="text-sm text-muted-foreground">Nothing is waiting for your approval. Draft a response and queue it above.</p>}
      <TaskProgress state={task.state} onRetry={task.retry} onDismiss={task.reset} title="Sending to PayPal" />
      {sent && (
        <p className="rounded-md border border-success/40 bg-success/10 p-3 text-sm">
          Evidence was sent to PayPal. PayPal&apos;s current status for this dispute: <strong>{statusLabel(view.dispute.status)}</strong>
          {view.dispute.outcome ? ` (outcome: ${statusLabel(view.dispute.outcome)})` : ""}. Only PayPal decides the result.
        </p>
      )}
    </div>
  );
}

function Pending({
  action,
  view,
  busy,
  run,
  approve,
}: {
  action: EvidenceAction;
  view: DisputeView;
  busy: boolean;
  run: (fn: () => Promise<unknown>, success: string) => Promise<void>;
  approve: (a: EvidenceAction) => Promise<void>;
}) {
  const blocked = !view.dispute.can.provideEvidence;
  return (
    <div className="space-y-3 rounded-md border p-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Ready to send to PayPal</span>
        <Badge variant={action.status === "failed" ? "destructive" : "warning"}>{action.status}</Badge>
      </div>
      <p className="whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">{action.payload.notes}</p>
      {action.payload.tracking && (
        <p className="text-sm">
          Tracking included: <span className="font-mono">{action.payload.tracking.trackingNumber}</span> ({action.payload.tracking.carrierName})
        </p>
      )}
      <p className="text-xs text-muted-foreground">Cites {action.payload.cited.join(", ")}. The [F#] markers are removed before sending.</p>
      {blocked && (
        <p className="rounded-md border border-warning/50 bg-warning/10 p-3 text-sm">
          PayPal does not accept evidence at this stage ({statusLabel(view.dispute.status)}). Approve will check again and send nothing unless PayPal allows it.
        </p>
      )}
      {action.error && <p className="break-words text-sm text-destructive">Last attempt failed: {action.error}</p>}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button className="w-full sm:w-auto" disabled={busy} onClick={() => approve(action)}>
          {action.status === "failed" ? "Approve and retry" : "Approve and send to PayPal"}
        </Button>
        {action.status === "pending" && (
          <Button className="w-full sm:w-auto" variant="outline" disabled={busy} onClick={() => run(() => api(`/api/actions/${action.id}/reject`, { method: "POST" }), "Rejected. Nothing was sent to PayPal.")}>
            Reject
          </Button>
        )}
      </div>
    </div>
  );
}

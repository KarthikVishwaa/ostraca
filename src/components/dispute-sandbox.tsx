"use client";

import { useState } from "react";
import { FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "./sale-types";
import type { DisputeView } from "./dispute-types";

type Step = "require_evidence" | "adjudicate:SELLER_FAVOR" | "adjudicate:BUYER_FAVOR";

/** Only rendered when the server says PAYPAL_API_BASE is the sandbox. Each step needs a second click to confirm. */
export function SandboxBox({ view, onChanged }: { view: DisputeView; onChanged: () => void }) {
  const [armed, setArmed] = useState<Step | null>(null);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const resolved = view.dispute.status === "RESOLVED";

  async function go(step: Step) {
    if (armed !== step) return setArmed(step);
    setArmed(null);
    setBusy(true);
    setRefusal(null);
    const [action, outcome] = step.split(":");
    try {
      const r = await api<{ status: string }>(`/api/disputes/${view.dispute.id}/sandbox`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(outcome ? { action, outcome } : { action }),
      });
      toast.success(`PayPal accepted it. PayPal now reports: ${r.status.replace(/_/g, " ").toLowerCase()}`);
    } catch (e) {
      setRefusal((e as Error).message); // PayPal's real message
    } finally {
      setBusy(false);
      onChanged();
    }
  }

  const label = (step: Step, text: string) => (armed === step ? "Click again to confirm" : text);
  return (
    <div className="space-y-3 rounded-md border-2 border-dashed border-warning p-4">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <FlaskConical className="size-4" /> SANDBOX ONLY: simulates buyer or PayPal steps
      </p>
      <p className="text-xs text-muted-foreground">
        These do not exist in real PayPal. They only stage a demo. PayPal may refuse them: &quot;Move to evidence stage&quot; is for disputes that
        are not already waiting for you, and &quot;Adjudicate&quot; works only while PayPal has the dispute under review (which starts after you
        submit evidence). You will see PayPal&apos;s own message if it refuses. The result is always read back from PayPal.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={busy || resolved} onClick={() => go("require_evidence")}>
          {label("require_evidence", "Move to evidence stage")}
        </Button>
        <Button size="sm" variant="outline" disabled={busy || resolved} onClick={() => go("adjudicate:SELLER_FAVOR")}>
          {label("adjudicate:SELLER_FAVOR", "Adjudicate: seller wins")}
        </Button>
        <Button size="sm" variant="outline" disabled={busy || resolved} onClick={() => go("adjudicate:BUYER_FAVOR")}>
          {label("adjudicate:BUYER_FAVOR", "Adjudicate: buyer wins")}
        </Button>
      </div>
      {!view.dispute.can.adjudicate && !resolved && (
        <p className="text-xs text-muted-foreground">PayPal does not currently list an adjudicate action for this dispute, so expect a refusal.</p>
      )}
      {refusal && <p className="break-words rounded-md border border-destructive/40 p-2 text-sm text-destructive">PayPal refused: {refusal}</p>}
    </div>
  );
}

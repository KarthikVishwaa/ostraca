"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "./sale-types";

type Result = { reused: boolean; alreadyLinked?: boolean; checks: Array<{ field: string; status: string; note: string }> };

/** Works without any AI key. The server runs the same validation code on what you type. */
export function ManualEntryForm({ transactionId, onDone }: { transactionId: string; onDone: () => void }) {
  const [v, setV] = useState({ trackingNumber: "", carrier: "", shipDate: "", destinationCity: "" });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api<Result>("/api/evidence/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId, ...v }),
      });
      if (res.reused) toast.info("Already in your proof record.");
      const bad = res.checks.filter((c) => c.status === "rejected");
      if (bad.length) toast.warning(`Saved, but flagged: ${bad.map((c) => c.note).join("; ")}`);
      else if (!res.reused) toast.success("Saved and checked. Review the result below.");
      setV({ trackingNumber: "", carrier: "", shipDate: "", destinationCity: "" });
      onDone();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="m-tracking">Tracking number</Label>
          <Input id="m-tracking" value={v.trackingNumber} onChange={set("trackingNumber")} placeholder="EE123456785IN" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="m-carrier">Carrier</Label>
          <Input id="m-carrier" value={v.carrier} onChange={set("carrier")} placeholder="India Post, DHL, FedEx…" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="m-date">Ship date (optional)</Label>
          <Input id="m-date" type="date" value={v.shipDate} onChange={set("shipDate")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="m-city">Destination city (optional)</Label>
          <Input id="m-city" value={v.destinationCity} onChange={set("destinationCity")} />
        </div>
      </div>
      <Button type="submit" disabled={busy || !v.trackingNumber.trim() || !v.carrier.trim()}>
        {busy ? "Checking…" : "Save and check"}
      </Button>
    </form>
  );
}

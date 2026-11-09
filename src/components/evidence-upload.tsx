"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { api, type SaleDTO } from "./sale-types";

const KINDS = [
  ["", "Let AI decide"],
  ["courier_receipt", "Courier receipt"],
  ["invoice", "Invoice"],
  ["delivery_photo", "Delivery photo"],
  ["chat_screenshot", "Chat screenshot"],
  ["voice_note", "Voice note"],
  ["other", "Other"],
] as const;

const selectClass = "h-9 w-full rounded-md border bg-background px-3 text-sm shadow-xs";

export function EvidenceUpload({ transactionId, ai, onDone }: { transactionId: string; ai: SaleDTO["ai"]; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState("");
  const [manual, setManual] = useState(!ai.claude);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return toast.error("Choose a receipt photo, PDF or voice note first.");
    const form = new FormData();
    form.set("file", file);
    form.set("transactionId", transactionId);
    if (kind) form.set("kind", kind);
    if (manual) form.set("mode", "manual");
    setBusy(true);
    setNotice(null);
    try {
      const res = await api<{ aiError: string | null; manual: boolean; fieldCount: number; reused?: boolean; alreadyLinked?: boolean }>("/api/evidence", { method: "POST", body: form });
      if (res.reused) {
        toast.info(res.alreadyLinked ? "Already in your proof record. This sale already uses this file." : "Already in your proof record. Linked to this sale without storing it twice.");
      } else if (res.aiError) {
        setNotice(`${res.aiError}. Your file is saved; add the details with Manual entry on the card below.`);
      } else if (res.manual) {
        toast.success("File saved. Add the details with Manual entry on the card below.");
      } else {
        toast.success(`File saved. AI suggested ${res.fieldCount} field(s). Review them below.`);
      }
      if (fileRef.current) fileRef.current.value = "";
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {!ai.claude && (
        <p className="rounded-md border border-warning/50 bg-warning/10 p-3 text-sm">
          AI extraction is off (<code>ANTHROPIC_API_KEY</code> is not set). You can still upload a file and type the details with Manual entry.
        </p>
      )}
      {manual === false && !ai.openai && (
        <p className="text-xs text-muted-foreground">Voice notes need <code>OPENAI_API_KEY</code>; without it, use Manual entry for voice notes.</p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="evidence-file">Receipt photo, PDF or voice note</Label>
          <input
            id="evidence-file"
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,audio/*"
            className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-secondary file:px-3 file:py-1.5 file:text-sm"
          />
          <p className="text-xs text-muted-foreground">Max 8 MB. The original is stored unchanged with a SHA-256 fingerprint.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="evidence-kind">What is it?</Label>
          <select id="evidence-kind" value={kind} onChange={(e) => setKind(e.target.value)} className={selectClass}>
            {KINDS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 pt-1 text-sm">
            <input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} disabled={!ai.claude} />
            Manual entry (skip AI, I will type the details)
          </label>
        </div>
      </div>
      <Button onClick={upload} disabled={busy}>
        <Upload /> {busy ? (manual ? "Saving…" : "Reading…") : manual ? "Save file" : "Upload and read"}
      </Button>
      {notice && <p className="rounded-md border border-warning/50 bg-warning/10 p-3 text-sm">{notice}</p>}
    </div>
  );
}

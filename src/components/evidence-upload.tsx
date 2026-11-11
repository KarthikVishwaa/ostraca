"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { TaskProgress } from "@/components/ui/task-progress";
import { uploadStream } from "@/lib/api-client";
import type { SaleDTO } from "./sale-types";
import { useStagedTask } from "./use-staged-task";

type UploadAnswer = { aiError: string | null; manual: boolean; fieldCount: number; reused?: boolean; alreadyLinked?: boolean };

const KINDS = [
  ["", "Let AI decide"],
  ["courier_receipt", "Courier receipt"],
  ["invoice", "Invoice"],
  ["delivery_photo", "Delivery photo"],
  ["chat_screenshot", "Chat screenshot"],
  ["voice_note", "Voice note"],
  ["other", "Other"],
] as const;

const selectClass = "h-11 w-full rounded-md border bg-background px-3 text-base shadow-xs md:h-9 md:text-sm";

export function EvidenceUpload({ transactionId, ai, onDone }: { transactionId: string; ai: SaleDTO["ai"]; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState("");
  const [manual, setManual] = useState(!ai.claude);
  const [notice, setNotice] = useState<string | null>(null);

  const task = useStagedTask<UploadAnswer>();

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return toast.error("Choose a receipt photo, PDF or voice note first.");
    const form = new FormData();
    form.set("file", file);
    form.set("transactionId", transactionId);
    if (kind) form.set("kind", kind);
    if (manual) form.set("mode", "manual");
    setNotice(null);
    // Real stages: the browser reports the upload itself, the server then streams hashing, reading, checking, saving.
    const r = await task.run((report) => uploadStream<UploadAnswer>("/api/evidence", form, report));
    if (!r) return; // already running: ignore the second click
    if (!r.ok) {
      if (r.error.code === "ai_paused") {
        setManual(true); // the file was not stored; the seller can retry right away without AI
        setNotice("AI is paused for today. Manual entry is switched on: choose Save file again, then type the details in.");
        task.reset();
      }
      return; // any other error: the real message and a Retry button are shown by <TaskProgress>
    }
    const res = r.data;
    if (res.reused) {
      toast.info(res.alreadyLinked ? "Already in your proof record. This sale already uses this file." : "Already in your proof record. Linked to this sale without storing it twice.");
    } else if (res.aiError) {
      setNotice(res.aiError);
    } else if (res.manual) {
      toast.success("File saved. Add the details with Manual entry on the card below.");
    } else {
      toast.success(`File saved. AI suggested ${res.fieldCount} field(s). Review them below.`);
    }
    if (fileRef.current) fileRef.current.value = "";
    onDone();
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
            className="block w-full text-base file:mr-3 file:min-h-11 file:rounded-md file:border file:bg-secondary file:px-3 file:py-1.5 file:text-base md:text-sm md:file:min-h-0 md:file:text-sm"
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
          <label className="flex min-h-11 items-center gap-3 pt-1 text-sm md:min-h-0 md:gap-2">
            <input type="checkbox" className="size-5 md:size-4" checked={manual} onChange={(e) => setManual(e.target.checked)} disabled={!ai.claude} />
            Manual entry (skip AI, I will type the details)
          </label>
        </div>
      </div>
      <Button onClick={upload} disabled={task.running} className="w-full sm:w-auto">
        <Upload /> {task.running ? (manual ? "Saving…" : "Reading…") : manual ? "Save file" : "Upload and read"}
      </Button>
      <TaskProgress state={task.state} onRetry={task.retry} onDismiss={task.reset} title={manual ? "Saving the file" : "Uploading and reading the file"} />
      {notice && <p className="rounded-md border border-warning/50 bg-warning/10 p-3 text-sm">{notice}</p>}
    </div>
  );
}

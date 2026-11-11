"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { NOTE_STORAGE_KEY } from "@/lib/limitation-text";
import { TaskProgress } from "@/components/ui/task-progress";
import { requestStream } from "@/lib/api-client";
import { api } from "./sale-types";
import { useStagedTask } from "./use-staged-task";

type Check = { ok: boolean; problems: string[] };
type Generated = { note: null; message: string } | { note: string; source: "ai" | "template"; notice: string | null; check: Check; facts: Array<{ id: string; text: string }> };

/** Optional cover note. AI (or a template) suggests; code checks every citation, number and promise; the seller edits. */
export function LimitationNote({ aiOn, empty }: { aiOn: boolean; empty: boolean }) {
  const [note, setNote] = useState("");
  const [source, setSource] = useState<"ai" | "template" | "edited" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [check, setCheck] = useState<Check | null>(null);
  const [facts, setFacts] = useState<Array<{ id: string; text: string }>>([]);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  // Keep the note across the print page (browser storage is only a convenience; the page works without it).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(NOTE_STORAGE_KEY);
      if (saved) {
        setNote(saved);
        setSource("edited");
      }
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(NOTE_STORAGE_KEY, note);
    } catch {
      /* ignore */
    }
  }, [note]);

  const task = useStagedTask<Generated>();

  async function generate(template = false) {
    setMessage(null);
    const r = await task.run((report) =>
      requestStream<Generated>(
        "/api/limitation/note",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "generate", ...(template ? { template: true } : {}) }) },
        report
      )
    );
    if (!r) return; // already running: ignore the second click
    if (!r.ok) {
      if (r.error.code === "ai_paused") {
        toast.info("AI is paused for today. Using a plain template built from your numbers.");
        task.reset();
        return generate(true);
      }
      return; // the real error and a Retry button are shown by <TaskProgress>
    }
    const d = r.data;
    if (d.note === null) return setMessage(d.message);
    setNote(d.note);
    setSource(d.source);
    setNotice(d.notice);
    setCheck(d.check);
    setFacts(d.facts);
  }

  useEffect(() => {
    if (source === null || !note.trim()) return setCheck(null);
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const r = await api<{ check: Check }>("/api/limitation/note", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "check", note }),
        });
        if (mine === seq.current) setCheck(r.check);
      } catch {
        /* keep the last verdict */
      }
    }, 500);
    return () => clearTimeout(t);
  }, [note, source]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button className="w-full sm:w-auto" onClick={() => generate()} disabled={task.running || busy || empty}>
          <Sparkles /> {note ? "Write it again" : aiOn ? "Write a cover note with AI" : "Write a plain template"}
        </Button>
        {!aiOn && <span className="text-xs text-muted-foreground">AI is off (ANTHROPIC_API_KEY not set). A template built from your numbers is used.</span>}
        <span className="text-xs text-muted-foreground">Optional. The pack works without it.</span>
      </div>
      <TaskProgress state={task.state} onRetry={task.retry} onDismiss={task.reset} title="Writing the cover note" />
      {message && <p className="rounded-md border p-3 text-sm">{message}</p>}
      {notice && <p className="rounded-md border border-warning/50 bg-warning/10 p-3 text-sm">{notice}</p>}
      {source && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary">{source === "ai" ? "AI suggestion" : source === "template" ? "Template from your numbers" : "Your note"}</Badge>
            Edit freely. Every sentence must cite facts like [F2], and the numbers must match.
          </div>
          <Textarea
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              setSource("edited");
            }}
            rows={7}
            aria-label="Cover note"
          />
          {check?.ok && note.trim() && (
            <p className="flex items-center gap-2 text-sm text-success">
              <CheckCircle2 className="size-4" /> Checks passed: cited facts exist, numbers match, and it makes no promise about the limitation.
            </p>
          )}
          {check && !check.ok && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <p className="flex items-center gap-2 font-medium text-destructive">
                <AlertTriangle className="size-4" /> This note has problems. It will be left out of the pack until it passes.
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {check.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          {facts.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">Facts you can cite ({facts.length})</summary>
              <ul className="mt-2 space-y-1">
                {facts.map((f) => (
                  <li key={f.id}>
                    <span className="font-mono text-xs">[{f.id}]</span> {f.text}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

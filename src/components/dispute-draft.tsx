"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { TaskProgress } from "@/components/ui/task-progress";
import { requestStream } from "@/lib/api-client";
import { api } from "./sale-types";
import { useStagedTask } from "./use-staged-task";
import type { DisputeView, DraftCheck } from "./dispute-types";

type Generated =
  | { draft: null; reason: string; message: string; missing: string[] }
  | { draft: string; source: "ai" | "template"; notice: string | null; check: DraftCheck; missing: string[] };

/** AI (or a plain template) suggests; code checks every citation and number; the seller edits, then queues it for approval. */
export function DraftPanel({ view, onQueued }: { view: DisputeView; onQueued: () => void }) {
  const id = view.dispute.id;
  const [draft, setDraft] = useState("");
  const [source, setSource] = useState<"ai" | "template" | "edited" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [check, setCheck] = useState<DraftCheck | null>(null);
  const [blocked, setBlocked] = useState<{ message: string; missing: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  const task = useStagedTask<Generated>();

  async function generate(template = false) {
    setBlocked(null);
    const r = await task.run((report) =>
      requestStream<Generated>(
        `/api/disputes/${id}/draft`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "generate", ...(template ? { template: true } : {}) }) },
        report
      )
    );
    if (!r) return; // already running: ignore the second click
    if (!r.ok) {
      if (r.error.code === "ai_paused") {
        toast.info("AI is paused for today. Using a plain template built from your facts.");
        task.reset();
        return generate(true);
      }
      return; // the real error and a Retry button are shown by <TaskProgress>
    }
    const d = r.data;
    if (d.draft === null) {
      setBlocked({ message: d.message, missing: d.missing });
      setDraft("");
      setCheck(null);
      setSource(null);
    } else {
      setDraft(d.draft);
      setSource(d.source);
      setNotice(d.notice);
      setCheck(d.check);
    }
  }

  // Re-check after every edit (the server is the judge; this only shows its verdict).
  useEffect(() => {
    if (source === null) return;
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const r = await api<{ check: DraftCheck }>(`/api/disputes/${id}/draft`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "check", draft }),
        });
        if (mine === seq.current) setCheck(r.check);
      } catch {
        /* keep the last verdict */
      }
    }, 450);
    return () => clearTimeout(t);
  }, [draft, id, source]);

  async function queue() {
    setBusy(true);
    try {
      await api(`/api/disputes/${id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft }),
      });
      toast.success("Queued. Review it under Approval below. Nothing has been sent to PayPal.");
      onQueued();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const noSale = !view.sale;
  return (
    <div className="space-y-4">
      {noSale && <p className="text-sm text-muted-foreground">No matching sale, so there is no proof to build a response from.</p>}

      {!view.hasProof && !noSale && (
        <div className="rounded-md border border-warning/50 bg-warning/10 p-3 text-sm">
          <p className="font-medium">No verified proof on file yet. Nothing will be written or invented.</p>
          {view.missing.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {view.missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button className="w-full sm:w-auto" onClick={() => generate()} disabled={task.running || busy || noSale || !view.hasProof}>
          <Sparkles /> {draft ? "Draft again" : view.ai.claude ? "Draft response with AI" : "Draft a plain template"}
        </Button>
        {!view.ai.claude && <span className="text-xs text-muted-foreground">AI is off (ANTHROPIC_API_KEY not set). A template built from your facts is used.</span>}
      </div>

      <TaskProgress state={task.state} onRetry={task.retry} onDismiss={task.reset} title="Drafting the response" />

      {blocked && <p className="rounded-md border p-3 text-sm">{blocked.message}</p>}
      {notice && <p className="rounded-md border border-warning/50 bg-warning/10 p-3 text-sm">{notice}</p>}

      {source && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary">{source === "ai" ? "AI suggestion" : source === "template" ? "Template from facts" : "Edited by you"}</Badge>
            You can edit this. Every sentence must cite facts like [F2].
          </div>
          <Textarea
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setSource("edited");
            }}
            rows={8}
            aria-label="Response draft"
          />
          {check?.ok ? (
            <p className="flex items-center gap-2 text-sm text-success">
              <CheckCircle2 className="size-4" /> Checks passed: every sentence cites a fact and every number matches one.
            </p>
          ) : (
            check && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                <p className="flex items-center gap-2 font-medium text-destructive">
                  <AlertTriangle className="size-4" /> This draft cannot be approved yet
                </p>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {check.problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            )
          )}
          <Button className="w-full sm:w-auto" onClick={queue} disabled={busy || !check?.ok}>
            Queue for approval
          </Button>
        </div>
      )}

      {view.facts.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Facts you can cite ({view.facts.length})</summary>
          <ul className="mt-2 space-y-1">
            {view.facts.map((f) => (
              <li key={f.id}>
                <span className="font-mono text-xs">[{f.id}]</span> {f.text}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

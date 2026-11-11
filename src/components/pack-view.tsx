"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { PackData } from "@/lib/limitation";
import { NOTE_STORAGE_KEY, NOT_SENT } from "@/lib/limitation-text";
import { PACK_CSS, PackDocument } from "./pack-document";
import { request } from "@/lib/api-client";
import { api } from "./sale-types";

const logEvent = (event: "export_print" | "export_download") =>
  request("/api/limitation/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event }) });

/** The print-friendly page. Save as PDF with the browser's Print dialog, or download one self-contained HTML file. */
export function PackView() {
  const [data, setData] = useState<PackData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [noteProblems, setNoteProblems] = useState<string[]>([]);

  useEffect(() => {
    api<{ pack: PackData }>("/api/limitation").then((r) => setData(r.pack), (e) => setError(e.message));
    let saved = "";
    try {
      saved = localStorage.getItem(NOTE_STORAGE_KEY) ?? "";
    } catch {
      /* private window: no saved note */
    }
    if (!saved.trim()) return;
    // The server re-checks the note. One that fails is left out, so the pack never carries a claim the records do not support.
    api<{ check: { ok: boolean; problems: string[] } }>("/api/limitation/note", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "check", note: saved }),
    }).then(
      (r) => (r.check.ok ? setNote(saved) : setNoteProblems(r.check.problems)),
      (e) => setNoteProblems([`The cover note could not be checked: ${e.message}`])
    );
  }, []);

  function print() {
    logEvent("export_print");
    window.print();
  }

  function download() {
    const el = document.getElementById("pack");
    if (!el || !data) return;
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ostraca limitation pack (SIMULATED)</title><style>${PACK_CSS}</style></head><body>${el.outerHTML}</body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `ostraca-limitation-pack-${data.generatedAt.slice(0, 10)}-SIMULATED.html`;
    a.click();
    URL.revokeObjectURL(url);
    logEvent("export_download");
    toast.success("Downloaded. Nothing was sent to PayPal.");
  }

  if (error) return <p className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">Could not build the pack: {error}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Building the pack…</p>;
  return (
    <div className="space-y-4">
      <style>{PACK_CSS}</style>
      <div className="no-print flex flex-wrap items-center gap-2">
        <Link href="/limitation" className="mr-auto inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to the limitation pack
        </Link>
        <Button onClick={print}><Printer /> Print or save as PDF</Button>
        <Button variant="outline" onClick={download}><Download /> Download HTML file</Button>
      </div>
      <p className="no-print text-xs text-muted-foreground">{NOT_SENT} In the print dialog, choose &quot;Save as PDF&quot;.</p>
      {noteProblems.length > 0 && (
        <p className="no-print rounded-md border border-warning/50 bg-warning/10 p-3 text-sm">
          Your cover note was left out because it did not pass the checks: {noteProblems.join(" ")} Fix it on the limitation page and open this page again.
        </p>
      )}
      <PackDocument data={data} note={note} />
    </div>
  );
}

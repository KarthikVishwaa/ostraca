"use client";

import { useState } from "react";
import { Check, FileText, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api, type EvidenceDTO, type FieldDTO } from "./sale-types";

const LABELS: Record<string, string> = {
  tracking_number: "Tracking number",
  carrier: "Carrier",
  amount: "Amount (e.g. 25.00 USD)",
  date: "Ship date (yyyy-mm-dd)",
  buyer_name: "Buyer name",
  destination_city: "Destination city",
  transcript: "Voice note transcript",
};
const MANUAL_FIELDS = ["tracking_number", "carrier", "amount", "date", "buyer_name", "destination_city"];
const EDITABLE = new Set(MANUAL_FIELDS);
const USE_LABEL = { hold: "Hold", dispute: "Dispute", limitation: "Limitation" } as const;

function StatusBadge({ f }: { f: FieldDTO }) {
  if (f.status === "rejected") return <Badge variant="destructive">rejected</Badge>;
  if (f.status === "verified") return <Badge variant="success">verified</Badge>;
  if (f.confirmedValue != null) return <Badge variant="success">confirmed by you</Badge>;
  return <Badge variant="warning">needs review</Badge>;
}

function FieldRow({ evidenceId, f, onChanged }: { evidenceId: string; f: FieldDTO; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(f.value ?? "");
  const [busy, setBusy] = useState(false);

  async function save(value?: string) {
    setBusy(true);
    try {
      await api(`/api/evidence/${evidenceId}/fields`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field: f.field, value }),
      });
      setEditing(false);
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const canConfirm = f.status === "needs_review" && f.confirmedValue == null && EDITABLE.has(f.field);
  return (
    <li className="space-y-1 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{LABELS[f.field] ?? f.field}</span>
        <StatusBadge f={f} />
        {f.model === "manual" && <Badge variant="outline">typed by you</Badge>}
      </div>
      {editing ? (
        <div className="flex gap-2">
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} className="max-w-sm" aria-label={LABELS[f.field]} />
          <Button size="sm" onClick={() => save(draft)} disabled={busy || !draft.trim()}>
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <p className="break-words font-mono text-sm">{f.value ?? "—"}</p>
      )}
      {f.checkNote && <p className="text-xs text-muted-foreground">Check: {f.checkNote}</p>}
      {!editing && EDITABLE.has(f.field) && (
        <div className="flex gap-2 pt-1">
          {canConfirm && (
            <Button size="sm" variant="outline" onClick={() => save()} disabled={busy}>
              <Check /> Confirm
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => { setDraft(f.value ?? ""); setEditing(true); }}>
            <Pencil /> Edit
          </Button>
        </div>
      )}
    </li>
  );
}

function ManualEntry({ evidenceId, existing, onChanged }: { evidenceId: string; existing: Set<string>; onChanged: () => void }) {
  const options = MANUAL_FIELDS.filter((f) => !existing.has(f));
  const [field, setField] = useState(options[0] ?? "");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  if (!options.length) return null;

  async function add() {
    setBusy(true);
    try {
      await api(`/api/evidence/${evidenceId}/fields`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field: field || options[0], value }),
      });
      setValue("");
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 border-t pt-3">
      <p className="flex items-center gap-1 text-sm font-medium"><Plus className="size-4" /> Manual entry</p>
      <div className="flex flex-wrap gap-2">
        <select
          value={field || options[0]}
          onChange={(e) => setField(e.target.value)}
          className="h-9 rounded-md border bg-background px-3 text-sm shadow-xs"
          aria-label="Field to add"
        >
          {options.map((o) => (
            <option key={o} value={o}>{LABELS[o]}</option>
          ))}
        </select>
        <Input value={value} onChange={(e) => setValue(e.target.value)} className="max-w-xs" placeholder="Type the value" aria-label="Value" />
        <Button size="sm" onClick={add} disabled={busy || !value.trim()}>Add</Button>
      </div>
      <p className="text-xs text-muted-foreground">Code checks what you type, the same way it checks AI suggestions.</p>
    </div>
  );
}

export function EvidenceCard({ item, onChanged }: { item: EvidenceDTO; onChanged: () => void }) {
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <FileText className="size-4" /> {item.fileName}
          <Badge variant="secondary">{item.kind.replace("_", " ")}</Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          <a href={`/api/evidence/${item.id}/file`} target="_blank" rel="noreferrer" className="underline underline-offset-2">
            View original
          </a>{" "}
          · SHA-256 <span className="font-mono">{item.sha256.slice(0, 16)}…</span> · {(item.sizeBytes / 1024).toFixed(0)} KB · added {new Date(item.uploadedAt).toLocaleDateString()}
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Reused as proof for:</span>
          {item.usedFor.length ? (
            item.usedFor.map((u) => <Badge key={u} variant="success">{USE_LABEL[u]}</Badge>)
          ) : (
            <span className="text-muted-foreground">nothing yet. Confirm its details to unlock uses.</span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        {item.fields.length ? (
          <ul className="divide-y">
            {item.fields.map((f) => (
              <FieldRow key={`${f.field}-${f.confirmedValue}-${f.status}`} evidenceId={item.id} f={f} onChanged={onChanged} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No details yet. Add them below.</p>
        )}
        <ManualEntry evidenceId={item.id} existing={new Set(item.fields.map((f) => f.field))} onChanged={onChanged} />
      </CardContent>
    </Card>
  );
}

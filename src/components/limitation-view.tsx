"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FileText, FlaskConical, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PackData } from "@/lib/limitation";
import { NOT_SENT, NO_PROMISE, SAMPLE_NOTICE, SIMULATED_BANNER } from "@/lib/limitation-text";
import { LimitationNote } from "./limitation-note";
import { api } from "./sale-types";

type Payload = {
  pack: PackData;
  activity: Array<{ id: string; actor: string; event: string; details: unknown; createdAt: string }>;
  lastSimulation: string | null;
  ai: { claude: boolean };
};

const EVENT_LABEL: Record<string, string> = {
  "limitation.simulated": "Simulated a limitation notice",
  "limitation.report_read": "Read PayPal's report and your records",
  "limitation.note_generated": "Cover note drafted",
  "limitation.exported_print": "Opened the print or PDF dialog",
  "limitation.exported_download": "Downloaded the HTML file",
};

const day = (s: string) => new Date(s).toLocaleDateString();

export function LimitationView() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setData(await api<Payload>("/api/limitation"));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function simulate() {
    try {
      await api("/api/limitation/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: "simulate" }) });
      toast.success("Recorded. This is a simulation; no real limitation exists.");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div role="note" className="rounded-lg border-2 border-dashed border-warning bg-warning/10 p-3 text-sm font-semibold">
        {SIMULATED_BANNER}
      </div>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Limitation pack</h1>
          <p className="text-sm text-muted-foreground">Recent sales, matched to your proof, in one document you can submit yourself.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={busy}>
            <RefreshCw className={busy ? "animate-spin" : ""} /> Refresh from PayPal
          </Button>
          <Button variant="outline" onClick={simulate}>
            <FlaskConical /> Simulate limitation notice
          </Button>
        </div>
      </header>

      {data?.lastSimulation && (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base">{SAMPLE_NOTICE.title}</CardTitle>
            <CardDescription>Sample notice, simulated {new Date(data.lastSimulation).toLocaleString()}. Generic wording, written for this demo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {SAMPLE_NOTICE.body.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </CardContent>
        </Card>
      )}

      {error && <p className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">Could not build the pack: {error}</p>}
      {!data && !error && <p className="text-sm text-muted-foreground">Reading PayPal&apos;s Transaction Search and your proof record…</p>}

      {data && <PackBody data={data} onChanged={load} />}
    </div>
  );
}

function PackBody({ data, onChanged }: { data: Payload; onChanged: () => void }) {
  const { pack } = data;
  const s = pack.summary;
  const searchOk = pack.search.ok;
  void onChanged;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Where this list comes from</CardTitle>
          <CardDescription>
            Last 30 days ({day(pack.windowStart)} to {day(pack.windowEnd)})
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {pack.search.ok ? (
            <>
              <p>
                PayPal&apos;s Transaction Search listed <strong>{pack.search.listed}</strong> sale(s)
                {pack.search.excluded ? ` and ${pack.search.excluded} other entry(ies) that are not sales (funding, fees, refunds)` : ""}
                {pack.search.lastRefreshed ? `. Its data was last refreshed ${new Date(pack.search.lastRefreshed).toLocaleString()}.` : "."}
              </p>
              {s.notYetInPayPalReport > 0 && (
                <p className="text-muted-foreground">
                  {s.notYetInPayPalReport} sale(s) are in your Ostraca records but not in PayPal&apos;s report yet. Sandbox reports can lag by hours. They are shown from your own records and labelled.
                </p>
              )}
            </>
          ) : (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
              <p className="font-medium text-destructive">PayPal&apos;s Transaction Search could not be read:</p>
              <p className="break-words">{pack.search.error}</p>
              {pack.search.debugId && <p className="text-xs text-muted-foreground">PayPal debug_id: {pack.search.debugId}</p>}
              <p className="mt-1">Showing Ostraca&apos;s own transactions table instead, labelled as such.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Summary">
        <Stat label="Sales" value={`${s.total}`} sub={s.amounts.map((a) => `${a.total} ${a.currency}`).join(", ") || "none"} />
        <Stat label="Matched to proof" value={`${s.matched} of ${s.total}`} sub={s.unmatched ? `${s.unmatched} with no proof on file` : "no unmatched sales"} tone={s.unmatched ? "bad" : undefined} />
        <Stat label="Verified tracking" value={`${s.verifiedTracking} of ${s.total}`} sub={s.amounts.map((a) => `${a.withVerifiedTracking} ${a.currency} covered`).join(", ") || "none"} />
        <Stat label="Tracking filed" value={`${s.trackingFiled} of ${s.total}`} sub={`${s.withEvidence} with evidence on file`} />
      </section>
      <p className="text-xs text-muted-foreground">All numbers are counted by code from PayPal&apos;s report and your proof record. AI does not touch them.</p>

      <Card>
        <CardHeader>
          <CardTitle>Sales and their proof</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {pack.rows.length ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Date</th>
                  <th className="pr-3 font-medium">Amount</th>
                  <th className="pr-3 font-medium">Buyer</th>
                  <th className="pr-3 font-medium">Proof record</th>
                  <th className="pr-3 font-medium">Readiness</th>
                  <th className="pr-3 font-medium">Evidence</th>
                  <th className="pr-3 font-medium">Tracking filed</th>
                  <th className="font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                {pack.rows.map((r) => (
                  <tr key={r.key} className="border-b last:border-0 align-top">
                    <td className="py-2 pr-3 whitespace-nowrap">{day(r.date)}</td>
                    <td className="pr-3 whitespace-nowrap">{r.amount} {r.currency}</td>
                    <td className="pr-3">{r.buyer ?? "—"}</td>
                    <td className="pr-3">
                      {r.matched ? (
                        <Link href={`/sales/${r.saleId}`} className="underline underline-offset-2">Matched</Link>
                      ) : (
                        <Badge variant="destructive">No proof on file</Badge>
                      )}
                    </td>
                    <td className="pr-3">
                      {r.readinessScore === null ? "—" : <Badge variant={r.readinessScore >= 80 ? "success" : r.readinessScore >= 50 ? "warning" : "destructive"}>{r.readinessScore}</Badge>}
                    </td>
                    <td className="pr-3">{r.evidenceCount}{r.verifiedTracking ? " · tracking verified" : ""}</td>
                    <td className="pr-3">{r.trackingFiled ? <Badge variant="success">Yes</Badge> : <Badge variant="outline">No</Badge>}</td>
                    <td className="text-xs text-muted-foreground">
                      {!searchOk ? "Ostraca's own records" : r.source === "paypal" ? "In PayPal's report" : "Not in PayPal's report yet"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted-foreground">No sales in the last 30 days. Make a test sale in the Demo store.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Gaps</CardTitle>
          <CardDescription>What is still missing, so you can fix it before you send anything.</CardDescription>
        </CardHeader>
        <CardContent>
          {pack.gaps.length ? (
            <ul className="space-y-2 text-sm">
              {pack.gaps.map((g) => (
                <li key={g.captureId}>
                  <span className="font-mono text-xs">{g.captureId}</span> · {g.label}
                  <br />
                  <span className="text-muted-foreground">{g.problems.join("; ")}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No gaps in the sales listed above.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cover note (optional)</CardTitle>
          <CardDescription>AI only suggests. Code checks every citation, number and promise. You edit.</CardDescription>
        </CardHeader>
        <CardContent>
          <LimitationNote aiOn={data.ai.claude} empty={s.total === 0} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Export</CardTitle>
          <CardDescription>{NOT_SENT}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button asChild>
            <Link href="/limitation/pack">
              <FileText /> Open print-friendly pack
            </Link>
          </Button>
          <p className="text-sm text-muted-foreground">There you can save it as a PDF with your browser, or download one HTML file. {NO_PROMISE}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
          <CardDescription>Every step is logged.</CardDescription>
        </CardHeader>
        <CardContent>
          {data.activity.length ? (
            <ol className="space-y-2 text-sm">
              {data.activity.slice(0, 15).map((a) => (
                <li key={a.id}>
                  {EVENT_LABEL[a.event] ?? a.event}
                  <span className="text-xs text-muted-foreground"> · {new Date(a.createdAt).toLocaleString()} · {a.actor}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing yet.</p>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "bad" }) {
  return (
    <Card className="gap-1 py-4">
      <CardHeader className="pb-0">
        <CardDescription>{label}</CardDescription>
        <CardTitle className={`text-2xl ${tone === "bad" ? "text-destructive" : ""}`}>{value}</CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">{sub}</CardContent>
    </Card>
  );
}

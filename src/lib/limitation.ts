import "server-only";
import { desc, eq, gte, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { effectiveValue, isCounted } from "@/lib/proof";
import { searchTransactions, type SearchedTransaction } from "@/lib/paypal/reporting";
import { PayPalError } from "@/lib/paypal/client";
import type { Fact } from "@/lib/validation/draft";

/**
 * LIMITATION PACK data. Everything here is computed in code from PayPal's report and our own proof record.
 * No AI. It only describes records; nothing here claims to change PayPal's decision.
 */
export const WINDOW_DAYS = 30;

export type PackRow = {
  key: string;
  captureId: string;
  date: string; // ISO
  amount: string;
  currency: string;
  buyer: string | null;
  item: string | null;
  /** "paypal": listed in PayPal's Transaction Search. "ostraca_only": in our records but not (yet) in PayPal's report. */
  source: "paypal" | "ostraca_only";
  saleId: string | null;
  matched: boolean; // has a proof record in Ostraca
  readinessScore: number | null;
  evidenceCount: number;
  verifiedTracking: boolean;
  tracking: { number: string; carrier: string | null } | null;
  trackingFiled: boolean;
  problems: string[];
};

export type PackEvidence = {
  captureId: string;
  kind: string;
  fileName: string;
  sellerEntered: boolean; // typed details, no document
  sha256: string;
  uploadedAt: string;
  usedFor: string[];
};

export type SearchStatus =
  | { ok: true; listed: number; excluded: number; lastRefreshed: string | null }
  | { ok: false; error: string; debugId?: string };

export type PackData = {
  generatedAt: string;
  windowStart: string;
  windowEnd: string;
  search: SearchStatus;
  rows: PackRow[];
  summary: {
    total: number;
    matched: number;
    unmatched: number;
    notYetInPayPalReport: number;
    withEvidence: number;
    verifiedTracking: number;
    trackingFiled: number;
    /** Per currency, so different currencies are never added together. */
    amounts: Array<{ currency: string; total: string; withVerifiedTracking: string }>;
  };
  gaps: Array<{ captureId: string; label: string; problems: string[] }>;
  evidence: PackEvidence[];
};

const money = (n: number) => n.toFixed(2);
const day = (d: Date | string) => new Date(d).toISOString().slice(0, 10);

const buyerOf = (t: SearchedTransaction) => {
  const n = (t.payer_info?.payer_name ?? {}) as { alternate_full_name?: string; given_name?: string; surname?: string };
  return n.alternate_full_name || [n.given_name, n.surname].filter(Boolean).join(" ") || null;
};

export async function buildPack(now = new Date(), deps: { search: typeof searchTransactions } = { search: searchTransactions }): Promise<PackData> {
  const end = now;
  const start = new Date(end.getTime() - WINDOW_DAYS * 864e5);

  // PayPal's own report. A failure is shown to the seller as-is, and we fall back to our records.
  let search: SearchStatus;
  const listed: Array<{ id: string; date: string; amount: string; currency: string; buyer: string | null }> = [];
  try {
    let excluded = 0;
    let lastRefreshed: string | null = null;
    for (let page = 1; page <= 5; page++) {
      const r = await deps.search(start, end, page);
      lastRefreshed = r.last_refreshed_datetime ?? lastRefreshed;
      for (const t of r.transaction_details ?? []) {
        const info = t.transaction_info as {
          transaction_id?: string;
          transaction_event_code?: string;
          transaction_initiation_date?: string;
          transaction_amount?: { value?: string; currency_code?: string };
        };
        const value = Number(info.transaction_amount?.value);
        // Sales are incoming payments (T00xx). Funding, fees, refunds and adjustments are not sales.
        const isSale = !!info.transaction_id && value > 0 && (info.transaction_event_code ?? "").startsWith("T00");
        if (!isSale) {
          excluded++;
          continue;
        }
        listed.push({
          id: info.transaction_id!,
          date: info.transaction_initiation_date ?? end.toISOString(),
          amount: money(value),
          currency: info.transaction_amount?.currency_code ?? "USD",
          buyer: buyerOf(t),
        });
      }
      if (page >= (r.total_pages ?? 1)) break;
    }
    search = { ok: true, listed: listed.length, excluded, lastRefreshed };
  } catch (e) {
    search = { ok: false, error: (e as Error).message, debugId: e instanceof PayPalError ? e.debugId : undefined };
  }

  // Our proof record: every sale in the window (also used as the fallback list).
  const ours = await db().select().from(schema.transactions).where(gte(schema.transactions.capturedAt, start)).orderBy(desc(schema.transactions.capturedAt));
  const byCapture = new Map(ours.map((t) => [t.paypalCaptureId, t]));

  // Proof details for every matched sale, in two queries.
  const matchedSales = [...new Map([...listed.map((l) => byCapture.get(l.id)), ...ours].filter((x): x is NonNullable<typeof x> => !!x).map((t) => [t.id, t])).values()];
  const saleIds = matchedSales.map((t) => t.id);
  const links = saleIds.length
    ? await db()
        .select({ txId: schema.transactionEvidence.transactionId, usedFor: schema.transactionEvidence.usedFor, ev: schema.evidence })
        .from(schema.transactionEvidence)
        .innerJoin(schema.evidence, eq(schema.evidence.id, schema.transactionEvidence.evidenceId))
        .where(inArray(schema.transactionEvidence.transactionId, saleIds))
    : [];
  const evIds = [...new Set(links.map((l) => l.ev.id))];
  const fields = evIds.length ? await db().select().from(schema.evidenceExtractions).where(inArray(schema.evidenceExtractions.evidenceId, evIds)) : [];

  const proofFor = (saleId: string) => {
    const mine = links.filter((l) => l.txId === saleId);
    const counted = mine.flatMap((l) => fields.filter((f) => f.evidenceId === l.ev.id && isCounted(f)));
    const t = counted.find((f) => f.field === "tracking_number");
    const c = counted.find((f) => f.field === "carrier");
    return {
      evidenceCount: mine.length,
      tracking: t ? { number: effectiveValue(t) ?? "", carrier: c ? effectiveValue(c) : null } : null,
    };
  };

  const makeRow = (base: Pick<PackRow, "captureId" | "date" | "amount" | "currency" | "buyer" | "source">): PackRow => {
    const sale = byCapture.get(base.captureId);
    const proof = sale ? proofFor(sale.id) : { evidenceCount: 0, tracking: null };
    const problems: string[] = [];
    if (!sale) problems.push("No proof on file");
    else {
      if (!proof.evidenceCount) problems.push("No evidence uploaded");
      if (!proof.tracking) problems.push("Tracking number not verified");
      if (!sale.trackingFiled) problems.push("Tracking not filed with PayPal");
    }
    return {
      key: base.captureId,
      ...base,
      buyer: base.buyer ?? sale?.buyerName ?? null,
      item: sale?.itemDescription ?? null,
      saleId: sale?.id ?? null,
      matched: !!sale,
      readinessScore: sale?.readinessScore ?? null,
      evidenceCount: proof.evidenceCount,
      verifiedTracking: !!proof.tracking,
      tracking: proof.tracking,
      trackingFiled: !!sale?.trackingFiled,
      problems,
    };
  };

  // PayPal's list first; then any sale we hold that PayPal's report does not list (sandbox data can lag by hours).
  const rows: PackRow[] = listed.map((l) => makeRow({ captureId: l.id, date: l.date, amount: l.amount, currency: l.currency, buyer: l.buyer, source: "paypal" }));
  const listedIds = new Set(listed.map((l) => l.id));
  for (const t of ours) {
    if (!listedIds.has(t.paypalCaptureId)) {
      rows.push(makeRow({ captureId: t.paypalCaptureId, date: t.capturedAt.toISOString(), amount: t.amount, currency: t.currency, buyer: t.buyerName, source: "ostraca_only" }));
    }
  }
  rows.sort((a, b) => b.date.localeCompare(a.date));

  // Summary, all counted here.
  const currencies = [...new Set(rows.map((r) => r.currency))];
  const sum = (rs: PackRow[]) => money(rs.reduce((s, r) => s + Number(r.amount), 0));
  const summary: PackData["summary"] = {
    total: rows.length,
    matched: rows.filter((r) => r.matched).length,
    unmatched: rows.filter((r) => !r.matched).length,
    notYetInPayPalReport: rows.filter((r) => r.source === "ostraca_only").length,
    withEvidence: rows.filter((r) => r.evidenceCount > 0).length,
    verifiedTracking: rows.filter((r) => r.verifiedTracking).length,
    trackingFiled: rows.filter((r) => r.trackingFiled).length,
    amounts: currencies.map((currency) => {
      const rs = rows.filter((r) => r.currency === currency);
      return { currency, total: sum(rs), withVerifiedTracking: sum(rs.filter((r) => r.verifiedTracking)) };
    }),
  };

  const saleById = new Map(matchedSales.map((t) => [t.id, t]));
  const evidence: PackEvidence[] = links
    .filter((l) => saleById.has(l.txId))
    .map((l) => ({
      captureId: saleById.get(l.txId)!.paypalCaptureId,
      kind: l.ev.kind,
      fileName: l.ev.fileName,
      sellerEntered: l.ev.mimeType === "application/json",
      sha256: l.ev.sha256,
      uploadedAt: l.ev.uploadedAt.toISOString(),
      usedFor: l.usedFor,
    }));

  return {
    generatedAt: now.toISOString(),
    windowStart: start.toISOString(),
    windowEnd: end.toISOString(),
    search,
    rows,
    summary,
    gaps: rows.filter((r) => r.problems.length).map((r) => ({ captureId: r.captureId, label: r.item ?? "Sale", problems: r.problems })),
    evidence,
  };
}

/** Numbered facts the cover note may stand on. Every number comes from the summary above. */
export function packFacts(p: PackData): Fact[] {
  const s = p.summary;
  const facts: Fact[] = [];
  const add = (f: Omit<Fact, "id">) => facts.push({ ...f, id: `F${facts.length + 1}` });
  const amt = (list: Array<{ currency: string; total: string; withVerifiedTracking: string }>, key: "total" | "withVerifiedTracking") =>
    list.map((a) => `${a[key]} ${a.currency}`).join(" and ");

  add({
    kind: "summary",
    text: `Between ${day(p.windowStart)} and ${day(p.windowEnd)} (${WINDOW_DAYS} days), the seller's records list ${s.total} sales totalling ${amt(s.amounts, "total") || "0.00"}`,
    dates: [day(p.windowStart), day(p.windowEnd)],
    amounts: s.amounts.map((a) => a.total),
    counts: [s.total, WINDOW_DAYS],
  });
  add({
    kind: "summary",
    text: `${s.matched} of those ${s.total} sales are linked to a proof record kept by the seller, and ${s.withEvidence} have evidence stored unchanged with a SHA-256 fingerprint`,
    counts: [s.matched, s.total, s.withEvidence],
  });
  add({
    kind: "tracking",
    text: `${s.verifiedTracking} of the ${s.total} sales have a tracking number that code verified or the seller confirmed, covering ${amt(s.amounts, "withVerifiedTracking") || "0.00"}; ${s.trackingFiled} have that tracking filed with PayPal`,
    amounts: s.amounts.map((a) => a.withVerifiedTracking),
    counts: [s.verifiedTracking, s.total, s.trackingFiled],
  });
  if (p.gaps.length) {
    add({ kind: "summary", text: `${p.gaps.length} of the ${s.total} sales still have gaps, listed in the attached table`, counts: [p.gaps.length, s.total] });
  }
  add({ kind: "summary", text: "These records were prepared by the seller with Ostraca; the decision on the account is PayPal's alone" });
  return facts;
}

let cached: { at: number; pack: PackData } | null = null;

/** The pack, reusing a recent build so editing the cover note does not re-query PayPal on every keystroke. */
export async function getPack(maxAgeMs = 0): Promise<PackData> {
  if (cached && maxAgeMs > 0 && Date.now() - cached.at < maxAgeMs) return cached.pack;
  const pack = await buildPack();
  cached = { at: Date.now(), pack };
  return pack;
}

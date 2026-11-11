import { splitSafe } from "@/lib/format";
import type { Extraction } from "@/lib/ai/extract";
import { checkTracking, normalizeTracking } from "./tracking";
import { reconcileAmount } from "./amount";

export type FieldResult = {
  field: string;
  aiValue: string | null;
  status: "verified" | "needs_review" | "rejected";
  note: string;
};

type CaptureContext = {
  amount: string;
  currency: string;
  capturedAt: Date;
  buyerName?: string | null;
  shipToCity?: string | null;
};

/**
 * VALIDATION ENGINE — deterministic checks on AI suggestions. AI confidence alone never makes a field
 * "verified".
 */
export function validateExtraction(x: Extraction, tx: CaptureContext): FieldResult[] {
  const out: FieldResult[] = [];

  if (x.tracking_number) {
    const t = checkTracking(x.tracking_number);
    out.push({
      field: "tracking_number",
      aiValue: normalizeTracking(x.tracking_number),
      status: t.result === "valid_checksum" ? "verified" : t.result === "invalid" ? "rejected" : "needs_review",
      note: t.note,
    });
  }

  if (x.carrier) out.push({ field: "carrier", aiValue: x.carrier, status: "needs_review", note: "Seller confirms carrier" });

  if (x.amount || x.currency) {
    const a = reconcileAmount({
      evidenceAmount: x.amount,
      evidenceCurrency: x.currency,
      captureAmount: tx.amount,
      captureCurrency: tx.currency,
    });
    out.push({ field: "amount", aiValue: [x.amount, x.currency].filter(Boolean).join(" "), status: a.status, note: a.note });
  }

  if (x.date) {
    const d = new Date(x.date);
    const sale = new Date(tx.capturedAt.toDateString());
    const ok = !Number.isNaN(d.getTime()) && d >= sale && d.getTime() - sale.getTime() < 60 * 864e5;
    out.push({
      field: "date",
      aiValue: x.date,
      status: ok ? "verified" : "needs_review",
      note: ok ? "On or after the sale date" : "Date is before the sale or far after it",
    });
  }

  if (x.buyer_name) {
    const match = tx.buyerName ? fuzzyIncludes(tx.buyerName, x.buyer_name) : false;
    out.push({
      field: "buyer_name",
      aiValue: x.buyer_name,
      status: match ? "verified" : "needs_review",
      note: match
        ? "Matches the PayPal buyer"
        : tx.buyerName
          ? "Could not match the PayPal buyer name"
          : "PayPal sent no buyer name to compare against. Seller confirms",
    });
  }

  if (x.destination_city) {
    const match = tx.shipToCity ? fuzzyIncludes(tx.shipToCity, x.destination_city) : false;
    out.push({
      field: "destination_city",
      aiValue: x.destination_city,
      status: match ? "verified" : "needs_review",
      note: match
        ? "Matches the order's shipping city"
        : tx.shipToCity
          ? "City not matched to the order"
          : "This PayPal order has no shipping city to compare against. Seller confirms",
    });
  }

  if (x.transcript_original) {
    out.push({ field: "transcript", aiValue: x.transcript_english ?? x.transcript_original, status: "needs_review", note: `Voice note (${x.language ?? "unknown language"}) — seller confirms` });
  }

  return out;
}

function fuzzyIncludes(a: string, b: string) {
  const n = (s: string) => s.toLowerCase().replace(/[^a-z஀-௿ऀ-ॿ]/g, "");
  const A = n(a), B = n(b);
  return !!A && !!B && (A.includes(B) || B.includes(A));
}

/** Fields a seller may type in or edit by hand (Manual entry). */
export const MANUAL_FIELDS = ["tracking_number", "carrier", "amount", "date", "buyer_name", "destination_city"] as const;
export type ManualField = (typeof MANUAL_FIELDS)[number];

const BLANK: Extraction = {
  kind: "other", language: null, transcript_original: null, transcript_english: null, tracking_number: null,
  carrier: null, amount: null, currency: null, date: null, buyer_name: null, destination_city: null,
  items: null, confidence: 0,
};

/**
 * Re-check ONE value the seller typed or edited, with the same rules as an AI suggestion. `aiValue` in the
 * result is the normalised value to store as the confirmed value.
 */
export function validateField(field: ManualField, value: string, tx: CaptureContext): FieldResult {
  const v = value.trim();
  const x: Extraction = { ...BLANK };
  if (field === "amount") {
    const [amount, currency] = splitSafe(v, /\s+/);
    x.amount = amount ?? null;
    x.currency = currency ?? null;
  } else {
    x[field] = v;
  }
  return validateExtraction(x, tx)[0] ?? { field, aiValue: v, status: "needs_review", note: "Nothing to check" };
}

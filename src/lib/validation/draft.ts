import { splitSafe } from "@/lib/format";
/**
 * Deterministic checks on a dispute draft (no AI, database or network). Whoever wrote it, Claude or the seller,
 * every sentence must cite a numbered fact and every number must match one.
 */
export type FactKind = "sale" | "dispute" | "tracking" | "filed" | "shipdate" | "city" | "delivery" | "evidence" | "summary";

export type Fact = {
  id: string; // "F1"
  kind: FactKind;
  text: string; // one plain sentence, no citation
  tokens?: string[]; // tracking numbers, capture IDs, dispute IDs that may appear in the draft
  dates?: string[]; // ISO yyyy-mm-dd that may appear in the draft
  amounts?: string[]; // "120.00"
  counts?: number[]; // whole numbers that may appear (only enforced with { checkCounts: true })
};

export type DraftCheck = { ok: boolean; problems: string[]; cited: string[] };

/** Facts that count as real proof (the sale and the dispute itself are context, not proof). */
export const PROOF_KINDS: FactKind[] = ["tracking", "shipdate", "delivery", "evidence"];
export const hasProof = (facts: Fact[]) => facts.some((f) => PROOF_KINDS.includes(f.kind));

const CITE_GROUP = /\[(F\d+(?:\s*[,;]\s*F\d+)*)\]/g;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_RE = "(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?";

/** Remove [F2] markers. Used before sending text to PayPal; citations are for the seller, not the buyer. */
export function stripCitations(text: string) {
  return text
    .replace(/\s*\[F\d+(?:\s*[,;]\s*F\d+)*\]/g, "")
    .replace(/[ \t]+([.,;!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** A plain draft built only from the facts. Used when AI is unavailable. */
export function buildTemplate(facts: Fact[]) {
  return facts
    .filter((f) => f.kind !== "dispute")
    .map((f) => `${f.text} [${f.id}].`)
    .join("\n");
}

function sentences(draft: string) {
  const out: string[] = [];
  for (const raw of splitSafe(draft, /(?<=[.!?])\s+|\n+/)) {
    const s = raw.trim();
    if (!s) continue;
    // A chunk that is only a citation belongs to the sentence before it ("... captured. [F1]").
    if (!s.replace(CITE_GROUP, "").replace(/[.\s]/g, "") && out.length) out[out.length - 1] += " " + s;
    else out.push(s);
  }
  return out;
}

const norm = (s: string) => s.toUpperCase().replace(/[\s-]/g, "");

export function checkDraft(draft: string, facts: Fact[], options: { checkCounts?: boolean } = {}): DraftCheck {
  const problems: string[] = [];
  const byId = new Map(facts.map((f) => [f.id, f]));
  const cited = new Set<string>();

  const tokens = new Set<string>();
  const dates = new Set<string>();
  const amounts = new Set<string>();
  const counts = new Set<number>();
  for (const f of facts) {
    for (const t of f.tokens ?? []) {
      tokens.add(norm(t));
      splitSafe(t, "-").forEach((p) => tokens.add(norm(p)));
    }
    (f.dates ?? []).forEach((d) => dates.add(d));
    (f.amounts ?? []).forEach((a) => amounts.add(Number(a).toFixed(2)));
    (f.counts ?? []).forEach((n) => counts.add(n));
  }

  if (!draft.trim()) return { ok: false, problems: ["The draft is empty."], cited: [] };

  for (const sentence of sentences(draft)) {
    const ids = [...sentence.matchAll(CITE_GROUP)].flatMap((m) => m[1].match(/F\d+/g) ?? []);
    ids.forEach((id) => cited.add(id));
    const text = sentence.replace(CITE_GROUP, " ");
    const preview = `"${stripCitations(sentence).slice(0, 70)}"`;
    const words = splitSafe(text, /\s+/).filter(Boolean).length;

    for (const id of ids) if (!byId.has(id)) problems.push(`${preview} cites ${id}, which does not exist.`);

    const courtesy = words <= 8 && /^(thank you|thanks|regards|sincerely|best regards)\b/i.test(text.trim());
    if (!ids.length && !courtesy) problems.push(`${preview} has no citation. Cite a fact or remove the sentence.`);

    // "We received a payment" is fine; "the buyer received the parcel" or "delivered" needs delivery proof.
    const thing = "(?:item|parcel|package|order|goods|shipment|product)";
    const deliveryClaim = new RegExp(
      `\\b(?:deliver(?:ed|y)?|arriv(?:ed|al)|received\\s+(?:the|his|her|their)\\s+${thing}|${thing}\\s+(?:was|were|has been|had been)\\s+received)`,
      "i"
    );
    if (deliveryClaim.test(text)) {
      const supported = ids.some((id) => byId.get(id)?.kind === "delivery");
      if (!supported) problems.push(`${preview} talks about delivery, but no cited fact is delivery proof.`);
    }

    // Tracking-like tokens: 8-30 capitals/digits containing a digit.
    const forTokens = text.replace(/\b\d{4}-\d{2}-\d{2}\b/g, " "); // dates are checked separately below
    for (const t of forTokens.match(/\b(?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{7,39}\b/g) ?? []) {
      const parts = [norm(t), ...splitSafe(t, "-").map(norm)];
      if (!parts.some((p) => tokens.has(p))) problems.push(`${preview} contains "${t}", which matches no fact.`);
    }

    // Amounts: with a currency sign or code, or a bare number with two decimals.
    const found = new Set<string>();
    for (const m of text.matchAll(/(?:[$€£₹]|\b(?:USD|EUR|GBP|INR)\b)\s?(\d[\d,]*(?:\.\d+)?)/gi)) found.add(m[1]);
    for (const m of text.matchAll(/(\d[\d,]*(?:\.\d+)?)\s?(?:USD|EUR|GBP|INR)\b/gi)) found.add(m[1]);
    for (const m of text.matchAll(/(?<![\d.\-])(\d{1,3}(?:,\d{3})*\.\d{2})(?![\d-])/g)) found.add(m[1]);
    for (const a of found) {
      const n = Number(a.replace(/,/g, ""));
      if (!Number.isFinite(n) || !amounts.has(n.toFixed(2))) problems.push(`${preview} mentions the amount ${a}, which matches no fact.`);
    }

    // Whole numbers ("9 of 12 sales") are only enforced when asked, e.g. for the limitation cover note.
    if (options.checkCounts) {
      const rest = text
        .replace(/SHA-256/gi, " ")
        .replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ")
        .replace(/(?:[$€£₹]|\b(?:USD|EUR|GBP|INR)\b)\s?\d[\d,]*(?:\.\d+)?|\d[\d,]*(?:\.\d+)?\s?(?:USD|EUR|GBP|INR)\b|\d[\d,]*\.\d+/gi, " ")
        .replace(/\b(?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{7,39}\b/g, " ");
      for (const m of rest.matchAll(/\b\d+\b/g)) {
        if (!counts.has(Number(m[0]))) problems.push(`${preview} mentions the number ${m[0]}, which matches no fact.`);
      }
    }

    // Dates: ISO is checked exactly. Written-out dates are resolved when they carry a year, else refused.
    for (const d of text.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? []) {
      if (!dates.has(d)) problems.push(`${preview} mentions the date ${d}, which matches no fact.`);
    }
    const written = [
      ...text.matchAll(new RegExp(`\\b${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, "gi")).map((m) => ({ raw: m[0], mon: m[1], day: m[2], year: m[3] })),
      ...text.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH_RE}(?:,?\\s+(\\d{4}))?\\b`, "gi")).map((m) => ({ raw: m[0], mon: m[2], day: m[1], year: m[3] })),
    ];
    for (const w of written) {
      const mm = String(MONTHS.indexOf(w.mon.toLowerCase().slice(0, 3)) + 1).padStart(2, "0");
      const iso = w.year ? `${w.year}-${mm}-${w.day.padStart(2, "0")}` : null;
      if (!iso || !dates.has(iso)) problems.push(`${preview} mentions the date "${w.raw}", which matches no fact. Write dates as YYYY-MM-DD.`);
    }
    for (const d of text.match(/\b\d{1,2}[/.]\d{1,2}[/.]\d{2,4}\b/g) ?? []) {
      problems.push(`${preview} mentions the date "${d}", which cannot be matched to a fact. Write dates as YYYY-MM-DD.`);
    }
  }

  return { ok: problems.length === 0, problems: [...new Set(problems)], cited: [...cited] };
}

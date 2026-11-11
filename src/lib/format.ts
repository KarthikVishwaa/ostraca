/**
 * Safe formatting for values that can be empty. Buyer name, ship-to city, item, dates, carrier and
 * tracking number all come from PayPal or from a seller's typing and any of them can be null or undefined.
 */
export const EMPTY = "-";

type Maybe<T> = T | null | undefined;

/** Trimmed text, or the fallback when the value is missing or blank. */
export function formatText(v: Maybe<string | number>, fallback: string = EMPTY): string {
  if (v === null || v === undefined) return fallback;
  const s = String(v).trim();
  return s ? s : fallback;
}

/** "Priya Rao" -> "PR", "madonna" -> "M", missing -> "?". */
export function initials(name: Maybe<string>, fallback = "?"): string {
  const parts = formatText(name, "").split(/\s+/).filter(Boolean);
  if (!parts.length) return fallback;
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function toDate(v: Maybe<string | number | Date>): Date | null {
  if (v === null || v === undefined || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Local date, e.g. "11/9/2026", or the fallback when missing or not a real date. */
export function shortDate(v: Maybe<string | number | Date>, fallback: string = EMPTY): string {
  const d = toDate(v);
  return d ? d.toLocaleDateString() : fallback;
}

/** Local date and time, or the fallback. */
export function dateTime(v: Maybe<string | number | Date>, fallback: string = EMPTY): string {
  const d = toDate(v);
  return d ? d.toLocaleString() : fallback;
}

/** "120.00 USD", or just the amount when the currency is missing, or the fallback when both are. */
export function formatMoney(amount: Maybe<string | number>, currency?: Maybe<string>, fallback: string = EMPTY): string {
  const a = formatText(amount, "");
  if (!a) return fallback;
  const c = formatText(currency, "");
  return c ? `${a} ${c}` : a;
}

/** First `n` characters of an id or fingerprint, with an ellipsis when it was cut. */
export function shortId(v: Maybe<string>, n = 10, fallback: string = EMPTY): string {
  const s = formatText(v, "");
  if (!s) return fallback;
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/** "WAITING_FOR_SELLER_RESPONSE" -> "waiting for seller response". Safe for missing values. */
export function statusText(s: Maybe<string>, fallback: string = EMPTY): string {
  const t = formatText(s, "");
  return t ? t.replace(/_/g, " ").toLowerCase() : fallback;
}

/** `value.split(sep)` that cannot throw: a missing value gives an empty list. Use it for anything that may be null or undefined. */
export function splitSafe(value: Maybe<string>, sep: string | RegExp): string[] {
  return value === null || value === undefined ? [] : String(value).split(sep);
}

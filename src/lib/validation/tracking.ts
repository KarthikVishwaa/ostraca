/**
 * Deterministic tracking-number checks. Pure functions — no AI, no network.
 *
 * Honest limits: the UPU S10 check digit only applies to international postal
 * items in the S10 format (e.g. EE123456789IN). Other formats are checked by
 * pattern only and reported as "format_only", never as fully verified.
 */

export type TrackingCheck =
  | { result: "valid_checksum"; carrierGuess: string; note: string }
  | { result: "format_only"; carrierGuess: string | null; note: string }
  | { result: "invalid"; carrierGuess: string | null; note: string };

const S10 = /^([A-Z]{2})(\d{8})(\d)([A-Z]{2})$/;

export function s10CheckDigit(eightDigits: string): number {
  const weights = [8, 6, 4, 2, 3, 5, 9, 7];
  const sum = eightDigits.split("").reduce((acc, d, i) => acc + Number(d) * weights[i], 0);
  const c = 11 - (sum % 11);
  return c === 10 ? 0 : c === 11 ? 5 : c;
}

const patterns: Array<{ carrier: string; re: RegExp }> = [
  { carrier: "DHL", re: /^\d{10}$/ },
  { carrier: "FEDEX", re: /^(\d{12}|\d{15})$/ },
  { carrier: "UPS", re: /^1Z[0-9A-Z]{16}$/ },
  { carrier: "DELHIVERY", re: /^\d{13,14}$/ },
  { carrier: "BLUE_DART", re: /^\d{11}$/ },
];

export function normalizeTracking(raw: string) {
  return raw.toUpperCase().replace(/[\s-]/g, "");
}

export function checkTracking(raw: string): TrackingCheck {
  const t = normalizeTracking(raw);
  if (t.length < 8 || t.length > 40 || !/^[A-Z0-9]+$/.test(t)) {
    return { result: "invalid", carrierGuess: null, note: "Not a plausible tracking number" };
  }
  const m = t.match(S10);
  if (m) {
    const expected = s10CheckDigit(m[2]);
    const carrierGuess = m[4] === "IN" ? "INDIA_POST" : `POST_${m[4]}`;
    return Number(m[3]) === expected
      ? { result: "valid_checksum", carrierGuess, note: "UPU S10 check digit matches" }
      : { result: "invalid", carrierGuess, note: `S10 check digit should be ${expected} — likely a misread digit` };
  }
  const hit = patterns.find((p) => p.re.test(t));
  return {
    result: "format_only",
    carrierGuess: hit?.carrier ?? null,
    note: hit ? `Matches ${hit.carrier} format (no checksum available) — seller should confirm` : "Unknown format — seller should confirm",
  };
}

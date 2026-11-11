/**
 * Amount reconciliation with explicit rules instead of a blunt tolerance. Invoices can legitimately differ
 * from a PayPal capture (shipping, tax, discount, currency conversion).
 */

export type AmountCheck = { status: "verified" | "needs_review" | "rejected"; note: string };

export function reconcileAmount(input: {
  evidenceAmount: string | null;
  evidenceCurrency: string | null;
  captureAmount: string;
  captureCurrency: string;
}): AmountCheck {
  if (!input.evidenceAmount) return { status: "needs_review", note: "No amount found on the evidence" };
  const ev = Number(input.evidenceAmount.replace(/[^0-9.]/g, ""));
  const cap = Number(input.captureAmount);
  if (!Number.isFinite(ev) || ev <= 0) return { status: "rejected", note: "Amount could not be read as a number" };

  const sameCurrency = !input.evidenceCurrency || input.evidenceCurrency.toUpperCase() === input.captureCurrency.toUpperCase();
  if (!sameCurrency) {
    return {
      status: "needs_review",
      note: `Evidence is in ${input.evidenceCurrency}, payment in ${input.captureCurrency} — seller confirms the conversion`,
    };
  }
  if (Math.abs(ev - cap) < 0.005) return { status: "verified", note: "Exactly matches the PayPal capture" };
  if (ev < cap) return { status: "needs_review", note: `Evidence shows ${ev}, capture ${cap} — difference may be shipping or tax` };
  return { status: "needs_review", note: `Evidence shows ${ev}, more than capture ${cap} — possible discount or wrong sale` };
}

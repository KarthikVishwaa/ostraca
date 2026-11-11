import { CARRIER_NAME_OTHER_MAX, DISPUTE_CARRIERS, EVIDENCE_NOTES_MAX, EVIDENCE_TYPES, TRACKING_NUMBER_MAX } from "./dispute-enums";

/**
 * Builds the `evidences` array for POST /v1/customer/disputes/{id}/provide-evidence. Pure: no network, no database.
 * PayPal only accepts the evidence types it asked the seller for (`evidences` with source REQUESTED_FROM_SELLER on the
 * dispute), and an unaccepted type is refused with EVIDENCE_TYPE_IS_NOT_ALLOWED. For "item not received" disputes it asks
 * for PROOF_OF_FULFILLMENT, which needs tracking_info (a carrier from PayPal's list, or OTHER with the carrier named, and a
 * tracking number). Ostraca sends nothing else: it will not claim a signature, a refund or a return it cannot prove.
 */
export type TrackingInfo = { carrier_name: string; carrier_name_other?: string; tracking_number: string };
export type EvidenceItem = { evidence_type: string; evidence_info?: { tracking_info: TrackingInfo[] }; notes?: string };

export type EvidenceInput = {
  /** dispute.reason, for example MERCHANDISE_OR_SERVICE_NOT_RECEIVED */
  reason: string | null | undefined;
  /** dispute.dispute_life_cycle_stage: INQUIRY, CHARGEBACK, ... (both stages ask for the same proof of fulfillment) */
  stage?: string | null;
  /** types PayPal currently requests from the seller; empty or missing means PayPal did not say */
  requested?: readonly string[];
  /** the seller-approved text, citation markers already removed */
  notes: string;
  /** verified tracking; `carrierName` is the confirmed carrier or the one the tracking number itself points to */
  tracking?: { trackingNumber: string; carrierName?: string | null } | null;
};

export type EvidenceResult = { ok: true; evidences: EvidenceItem[] } | { ok: false; reason: string };

const CARRIERS = new Set(DISPUTE_CARRIERS);
const TYPES = new Set(EVIDENCE_TYPES);
const FULFILLMENT = "PROOF_OF_FULFILLMENT";
const DEFAULT_BY_REASON: Record<string, readonly string[]> = { MERCHANDISE_OR_SERVICE_NOT_RECEIVED: [FULFILLMENT] };

/** "India Post" -> INDIA_POST when PayPal lists it; any other carrier is OTHER with its own name in carrier_name_other. */
export function toDisputeCarrier(raw: string): { carrier_name: string; carrier_name_other?: string } {
  const key = raw.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (key && key !== "OTHER" && CARRIERS.has(key)) return { carrier_name: key };
  return { carrier_name: "OTHER", carrier_name_other: raw.trim().slice(0, CARRIER_NAME_OTHER_MAX) };
}

export function buildEvidencePayload(i: EvidenceInput): EvidenceResult {
  const notes = i.notes.trim();
  if (!notes) return { ok: false, reason: "There is no text to send." };
  if (notes.length > EVIDENCE_NOTES_MAX) return { ok: false, reason: `The text is ${notes.length} characters; PayPal accepts at most ${EVIDENCE_NOTES_MAX}.` };

  const requested = (i.requested ?? []).filter((t) => TYPES.has(t));
  const allowed = requested.length ? requested : (DEFAULT_BY_REASON[i.reason ?? ""] ?? []);

  if (!allowed.includes(FULFILLMENT)) {
    const asked = requested.length ? requested.join(", ") : "nothing we can send for this reason";
    return { ok: false, reason: `PayPal is asking for ${asked}. Ostraca can only send proof of fulfillment with a tracking number, so answer this request in PayPal.` };
  }

  const number = i.tracking?.trackingNumber.trim();
  if (!number) return { ok: false, reason: "PayPal asks for proof of fulfillment, which needs a verified tracking number. Add and confirm one on the sale page." };
  if (number.length > TRACKING_NUMBER_MAX) return { ok: false, reason: "The tracking number is too long for PayPal." };
  const carrier = i.tracking?.carrierName?.trim();
  if (!carrier) return { ok: false, reason: "PayPal asks for proof of fulfillment, which needs the carrier. Confirm the carrier on the sale page." };

  return {
    ok: true,
    evidences: [{ evidence_type: FULFILLMENT, evidence_info: { tracking_info: [{ ...toDisputeCarrier(carrier), tracking_number: number }] }, notes }],
  };
}

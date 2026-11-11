import "server-only";
import { paypal, type HateoasLink } from "./client";
import type { EvidenceItem } from "./evidence-payload";

export type DisputeSummary = {
  dispute_id: string;
  reason: string;
  status: string;
  dispute_state?: string;
  dispute_life_cycle_stage?: string;
  dispute_amount?: { value: string; currency_code: string };
  disputed_transactions?: Array<{ seller_transaction_id?: string; buyer_transaction_id?: string }>;
  create_time?: string;
  links?: HateoasLink[];
};

export type DisputeDetail = DisputeSummary & {
  dispute_outcome?: { outcome_code?: string };
  seller_response_due_date?: string;
  messages?: Array<{ posted_by: string; content: string; time_posted: string }>;
  /** What PayPal has asked for (REQUESTED_FROM_SELLER) or received (SUBMITTED_BY_*). */
  evidences?: Array<{ evidence_type: string; source?: string }>;
};

export function listDisputes(params: { pageSize?: number } = {}) {
  return paypal<{ items?: DisputeSummary[] }>("/v1/customer/disputes", {
    query: { page_size: params.pageSize ?? 20 },
  });
}

export function getDispute(id: string) {
  return paypal<DisputeDetail>(`/v1/customer/disputes/${encodeURIComponent(id)}`);
}

/**
 * Submit evidence. Only call after the seller approved AND hasLink(dispute.links, "provide_evidence").
 * Multipart: an "input" JSON part plus optional file parts.
 */
export function provideEvidence(input: {
  disputeId: string;
  /** Built by buildEvidencePayload (src/lib/paypal/evidence-payload.ts), the only place that knows PayPal's rules. */
  evidences: EvidenceItem[];
  files?: Array<{ name: string; type: string; bytes: Buffer }>;
  idempotencyKey: string;
}) {
  const form = new FormData();
  form.append("input", new Blob([JSON.stringify({ evidences: input.evidences })], { type: "application/json" }));
  input.files?.forEach((f, i) => form.append(`file${i + 1}`, new Blob([new Uint8Array(f.bytes)], { type: f.type }), f.name));
  return paypal(`/v1/customer/disputes/${encodeURIComponent(input.disputeId)}/provide-evidence`, {
    form,
    idempotencyKey: input.idempotencyKey,
  });
}

/* ---------- SANDBOX-ONLY helpers (for staging a demo). Never used for real outcomes. ---------- */

/** Moves a dispute to "waiting for seller evidence". Sandbox only. */
export function sandboxRequireEvidence(disputeId: string) {
  return paypal(`/v1/customer/disputes/${encodeURIComponent(disputeId)}/require-evidence`, {
    json: { action: "SELLER_EVIDENCE" },
  });
}

/** Simulates PayPal's decision. Sandbox only; requires status UNDER_REVIEW and an "adjudicate" link. */
export function sandboxAdjudicate(disputeId: string, outcome: "SELLER_FAVOR" | "BUYER_FAVOR") {
  return paypal(`/v1/customer/disputes/${encodeURIComponent(disputeId)}/adjudicate`, {
    json: { adjudication_outcome: outcome },
  });
}

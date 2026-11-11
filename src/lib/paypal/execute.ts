import "server-only";
import { addTracking } from "./orders";
import { provideEvidence } from "./disputes";
import type { EvidenceItem } from "./evidence-payload";

/**
 * EXECUTES an action the seller already approved. This module only talks to PayPal: it knows nothing about
 * the approval queue or the database, and the queue (src/lib/approvals.ts) never calls PayPal.
 */
export type TrackingPayload = {
  orderId: string;
  captureId: string;
  trackingNumber: string;
  carrier: string;
  carrierNameOther?: string;
};

/** `evidences` is rebuilt from PayPal's live dispute right before sending (see precheckEvidence). */
export type EvidencePayload = {
  paypalDisputeId: string;
  evidences?: EvidenceItem[];
};

export async function executeAction(action: { type: string; payload: unknown; idempotencyKey: string }) {
  switch (action.type) {
    case "add_tracking": {
      const p = action.payload as TrackingPayload;
      return addTracking({ ...p, idempotencyKey: action.idempotencyKey });
    }
    case "provide_evidence": {
      const p = action.payload as EvidencePayload;
      if (!p.evidences?.length) throw new Error("This evidence request was not prepared for PayPal. Nothing was sent.");
      return provideEvidence({ disputeId: p.paypalDisputeId, evidences: p.evidences, idempotencyKey: action.idempotencyKey });
    }
    default:
      throw new Error(`No executor for action type "${action.type}"`);
  }
}

import "server-only";
import { addTracking } from "./orders";
import { provideEvidence } from "./disputes";

/**
 * EXECUTES an action the seller already approved. This module only talks to PayPal:
 * it knows nothing about the approval queue or the database, and the queue
 * (src/lib/approvals.ts) never calls PayPal. The route handler joins them.
 */
export type TrackingPayload = {
  orderId: string;
  captureId: string;
  trackingNumber: string;
  carrier: string;
  carrierNameOther?: string;
};

/** `notes` is the seller-approved text with citation markers already removed. */
export type EvidencePayload = {
  paypalDisputeId: string;
  notes: string;
  tracking?: { carrierName: string; trackingNumber: string };
};

export async function executeAction(action: { type: string; payload: unknown; idempotencyKey: string }) {
  switch (action.type) {
    case "add_tracking": {
      const p = action.payload as TrackingPayload;
      return addTracking({ ...p, idempotencyKey: action.idempotencyKey });
    }
    case "provide_evidence": {
      const p = action.payload as EvidencePayload;
      return provideEvidence({ disputeId: p.paypalDisputeId, notes: p.notes, tracking: p.tracking, idempotencyKey: action.idempotencyKey });
    }
    default:
      throw new Error(`No executor for action type "${action.type}"`);
  }
}

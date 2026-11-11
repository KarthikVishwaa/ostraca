import { request } from "@/lib/api-client";

/** Shape of GET /api/transactions/[id] as the browser sees it (dates arrive as strings). */
export type FieldDTO = {
  field: string;
  aiValue: string | null;
  confirmedValue: string | null;
  value: string | null;
  status: "verified" | "needs_review" | "rejected";
  checkNote: string | null;
  model: string | null;
  counted: boolean;
};

export type EvidenceDTO = {
  id: string;
  kind: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  uploadedAt: string;
  usedFor: Array<"hold" | "dispute" | "limitation">;
  fields: FieldDTO[];
};

export type ActionDTO = {
  id: string;
  type: string;
  status: "pending" | "approved" | "rejected" | "executed" | "failed";
  payload: { trackingNumber: string; carrier: string; carrierNameOther?: string; captureId: string };
  error: string | null;
  createdAt: string;
};

export type ActivityDTO = { id: string; actor: string; event: string; details: unknown; createdAt: string };

export type SaleDTO = {
  transaction: {
    id: string;
    paypalCaptureId: string;
    amount: string;
    currency: string;
    buyerName: string | null;
    shipToCity: string | null;
    itemDescription: string | null;
    trackingFiled: string | null;
    readinessScore: number;
    capturedAt: string;
  };
  readiness: { score: number; level: "ready" | "partial" | "at_risk"; checks: Array<{ key: string; label: string; weight: number; passed: boolean }> };
  evidence: EvidenceDTO[];
  actions: ActionDTO[];
  activity: ActivityDTO[];
  ai: { claude: boolean; openai: boolean };
};

/** An API failure with the server's safe message, plus its status and code ("rate_limited", "ai_paused", ...). */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public retryAfter?: number,
    public debugId?: string,
    public problems?: string[]
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Convenience wrapper over `request` (src/lib/api-client.ts) for code that prefers try/catch: returns the
 * data, or throws an ApiError with the same safe message. It never assumes the body is JSON.
 */
export async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const r = await request<T>(url, init);
  if (r.ok) return r.data;
  const e = r.error;
  throw new ApiError(`${e.message}${e.debugId ? ` (PayPal debug_id: ${e.debugId})` : ""}`, e.status, e.code, e.retryAfter, e.debugId, e.problems);
}

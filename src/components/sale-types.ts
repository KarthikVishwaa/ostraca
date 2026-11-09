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

export async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const d = data as { error?: string; debug_id?: string };
    throw new Error(`${d.error ?? r.statusText}${d.debug_id ? ` (PayPal debug_id: ${d.debug_id})` : ""}`);
  }
  return data as T;
}

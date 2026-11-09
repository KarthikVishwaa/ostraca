/** Shapes returned by GET /api/disputes and GET /api/disputes/[id] (dates arrive as strings). */
export type DisputeListItem = {
  id: string;
  reason: string;
  status: string;
  stage: string | null;
  amount: { value: string; currency_code: string } | null;
  created: string | null;
  sale: { id: string; item: string | null; readinessScore: number } | null;
};

export type FactDTO = { id: string; kind: string; text: string };

export type EvidenceAction = {
  id: string;
  status: "pending" | "approved" | "rejected" | "executed" | "failed";
  payload: { draft: string; notes: string; tracking?: { carrierName: string; trackingNumber: string }; cited: string[] };
  error: string | null;
  createdAt: string;
};

export type DisputeView = {
  dispute: {
    id: string;
    status: string;
    state: string | null;
    stage: string | null;
    reason: string;
    amount: { value: string; currency_code: string } | null;
    due: string | null;
    outcome: string | null;
    created: string | null;
    messages: Array<{ by: string; content: string; time: string }>;
    can: { provideEvidence: boolean; adjudicate: boolean };
  };
  sale: {
    id: string;
    item: string | null;
    amount: string;
    currency: string;
    buyer: string | null;
    captureId: string;
    readinessScore: number;
    trackingFiled: string | null;
  } | null;
  evidence: Array<{ id: string; kind: string; fileName: string; sha256: string; uploadedAt: string; usedFor: string[] }>;
  facts: FactDTO[];
  missing: string[];
  hasProof: boolean;
  actions: EvidenceAction[];
  activity: Array<{ id: string; actor: string; event: string; details: unknown; createdAt: string }>;
  ai: { claude: boolean };
  sandbox: boolean;
};

export type DraftCheck = { ok: boolean; problems: string[]; cited: string[] };

export const statusLabel = (s: string) => s.replace(/_/g, " ").toLowerCase();

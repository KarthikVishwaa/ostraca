import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { and, eq, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { audit } from "@/db/audit";
import { syncDispute } from "@/lib/disputes-sync";
import { buildFacts, type DisputeContext } from "@/lib/dispute-facts";
import { proposeAction } from "@/lib/approvals";
import { hasLink } from "@/lib/paypal/client";
import { checkDraft, stripCitations } from "@/lib/validation/draft";
import { checkTracking } from "@/lib/validation/tracking";
import { buildEvidencePayload, type EvidenceItem } from "@/lib/paypal/evidence-payload";

/** PayPal dispute IDs look like PP-R-NHE-10197361. */
export const disputeIdSchema = z.string().regex(/^[A-Za-z0-9-]{6,40}$/);

/** Re-reads the dispute from PayPal (the only source of its status), then builds the facts for its sale. */
export async function loadDispute(id: string) {
  const synced = await syncDispute(id);
  const d = synced.detail;
  const ctx: DisputeContext = { id: d.dispute_id, reason: d.reason, created: d.create_time, amount: d.dispute_amount };
  const built = synced.sale ? await buildFacts(synced.sale, ctx) : null;
  return { ...synced, ctx, built };
}

type Loaded = Awaited<ReturnType<typeof loadDispute>>;

/** Verified tracking for the dispute's sale. The carrier is the confirmed one, else the one the tracking number itself points to. */
function trackingFor(d: Loaded) {
  const t = d.built?.tracking;
  if (!t) return null;
  const carrierName = t.carrierName ?? checkTracking(t.trackingNumber).carrierGuess ?? null;
  return { trackingNumber: t.trackingNumber, carrierName };
}

/** The evidences PayPal will accept right now, from the live dispute (reason, stage, what PayPal requested). */
function evidenceFor(d: Loaded, notes: string) {
  const requested = (d.detail.evidences ?? []).filter((e) => e.source === "REQUESTED_FROM_SELLER").map((e) => e.evidence_type);
  return buildEvidencePayload({ reason: d.detail.reason, stage: d.detail.dispute_life_cycle_stage, requested, notes, tracking: trackingFor(d) });
}

export type Failure = { ok: false; status: number; reason: string; problems?: string[] };

/**
 * Queue "submit this evidence to PayPal" as a PENDING action. The text is re-checked here against fresh
 * facts, so a client can never queue a draft that did not pass. Nothing is sent to PayPal.
 */
export async function proposeEvidence(disputeId: string, draft: string) {
  const d = await loadDispute(disputeId);
  if (!d.sale || !d.built) return fail(422, "No matching sale for this dispute, so there is no proof to cite.");
  if (!d.built.hasProof) return fail(422, "There is no verified proof on file yet. Add and confirm proof on the sale page first.", d.built.missing);

  const check = checkDraft(draft, d.built.facts);
  if (!check.ok) return fail(422, "The draft did not pass the checks.", check.problems);
  const notes = stripCitations(draft);
  if (notes.length > 2000) return fail(422, `The response is ${notes.length} characters; PayPal accepts at most 2000.`);

  const built = evidenceFor(d, notes);
  if (!built.ok) return fail(422, built.reason);
  const tracking = trackingFor(d);
  const digest = createHash("sha256").update(JSON.stringify({ notes, tracking })).digest("hex").slice(0, 16);
  const idempotencyKey = `evidence-${d.detail.dispute_id}-${digest}`;

  // An older pending draft for this dispute is stale once a new one is queued.
  const stale = await db()
    .update(schema.agentActions)
    .set({ status: "rejected", error: "Superseded by a newer draft" })
    .where(
      and(
        eq(schema.agentActions.disputeId, d.row.id),
        eq(schema.agentActions.type, "provide_evidence"),
        eq(schema.agentActions.status, "pending"),
        ne(schema.agentActions.idempotencyKey, idempotencyKey)
      )
    )
    .returning({ id: schema.agentActions.id });
  for (const s of stale) await audit("system", "action.superseded", { type: "agent_action", id: s.id });

  const action = await proposeAction(
    {
      type: "provide_evidence",
      transactionId: d.sale.id,
      disputeId: d.row.id,
      payload: { paypalDisputeId: d.detail.dispute_id, draft, notes, tracking: tracking ?? undefined, evidences: built.evidences, cited: check.cited },
      idempotencyKey,
    },
    { revive: true }
  );
  await audit("seller", "dispute.draft_queued", { type: "dispute", id: d.detail.dispute_id }, { actionId: action.id, cited: check.cited });
  return { ok: true as const, action };
}

/**
 * Run BEFORE approval is recorded. Re-reads the dispute from PayPal and refuses unless PayPal currently
 * offers provide_evidence, and the stored text still passes the checks against today's facts.
 */
export async function precheckEvidence(payload: { paypalDisputeId: string; draft: string }): Promise<{ ok: true; evidences: EvidenceItem[] } | Failure> {
  const d = await loadDispute(payload.paypalDisputeId);
  if (!hasLink(d.detail.links, "provide_evidence")) {
    await audit("system", "dispute.evidence_blocked", { type: "dispute", id: d.detail.dispute_id }, { status: d.detail.status, stage: d.detail.dispute_life_cycle_stage });
    return fail(409, "PayPal does not accept evidence at this stage. Nothing was sent.");
  }
  if (!d.built) return fail(422, "No matching sale for this dispute.");
  const check = checkDraft(payload.draft, d.built.facts);
  if (!check.ok) return fail(422, "The proof on file changed and the draft no longer passes the checks. Draft it again.", check.problems);
  const built = evidenceFor(d, stripCitations(payload.draft));
  if (!built.ok) return fail(422, built.reason);
  return { ok: true, evidences: built.evidences };
}

function fail(status: number, reason: string, problems?: string[]): Failure {
  return { ok: false, status, reason, problems };
}

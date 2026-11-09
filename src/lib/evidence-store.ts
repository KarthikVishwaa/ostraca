import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

/** Same bytes uploaded twice = one evidence row. The graph edge (transaction_evidence) is what is per sale. */
export async function findEvidenceBySha(sha256: string) {
  const [row] = await db()
    .select({ id: schema.evidence.id, kind: schema.evidence.kind })
    .from(schema.evidence)
    .where(eq(schema.evidence.sha256, sha256))
    .limit(1);
  return row ?? null;
}

/** Link evidence to a sale. Returns true if the link is new, false if it already existed. */
export async function linkEvidence(transactionId: string, evidenceId: string) {
  const rows = await db()
    .insert(schema.transactionEvidence)
    .values({ transactionId, evidenceId, linkedBy: "seller" })
    .onConflictDoNothing({ target: [schema.transactionEvidence.transactionId, schema.transactionEvidence.evidenceId] })
    .returning({ id: schema.transactionEvidence.id });
  return rows.length > 0;
}

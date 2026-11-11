import { existsSync, rmSync } from "node:fs";
import { connect } from "./db";
import { readState, stateFile } from "./state";

/**
 * Deletes only what the run created: the E2E sales and their links and actions, plus evidence uploaded
 * during the run that nothing else links to (never a file a real sale also uses).
 */
export default async function globalTeardown() {
  if (!existsSync(stateFile)) return;
  const s = readState();
  const db = await connect();
  try {
    const txIds = [s.main.id, s.sparse.id];
    const evIds: string[] = (await db.query(`select evidence_id from transaction_evidence where transaction_id = any($1)`, [txIds])).rows.map((r) => r.evidence_id);
    // Actions on the test sales, plus evidence actions this run queued on any dispute (created after the run began).
    const actionIds: string[] = (
      await db.query(
        `select id from agent_actions where transaction_id = any($1) or (type = 'provide_evidence' and created_at >= $2 and status in ('pending','rejected','failed'))`,
        [txIds, s.runStart]
      )
    ).rows.map((r) => r.id);

    await db.query(`delete from agent_actions where id = any($1)`, [actionIds]);
    await db.query(`delete from transactions where id = any($1)`, [txIds]); // cascades to transaction_evidence and the sale's extractions links
    // Evidence only if the run created it and nothing else links to it now.
    const orphan: string[] = (
      await db.query(
        `select e.id from evidence e where e.id = any($1) and e.uploaded_at >= $2 and not exists (select 1 from transaction_evidence te where te.evidence_id = e.id)`,
        [evIds, s.runStart]
      )
    ).rows.map((r) => r.id);
    if (orphan.length) await db.query(`delete from evidence where id = any($1)`, [orphan]);

    const entityIds = [...txIds, ...orphan, ...actionIds];
    await db.query(`delete from audit_logs where entity_id = any($1) and created_at >= $2`, [entityIds, s.runStart]);
    await db.query(
      `delete from audit_logs where created_at >= $1 and (
         event in ('dispute.draft_generated','dispute.draft_queued','dispute.evidence_blocked','dispute.evidence_submitted')
         or (entity_type = 'limitation'))`,
      [s.runStart]
    );
    console.log(`E2E cleanup: removed ${txIds.length} test sales, ${actionIds.length} actions, ${orphan.length} evidence rows.`);
  } finally {
    await db.end();
    rmSync(stateFile, { force: true });
  }
}

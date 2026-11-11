import { createHash } from "node:crypto";
import { connect } from "./db";
import { writeState } from "./state";

/**
 * Creates two marked test sales (capture IDs start with "E2E-"): a normal one and one with no buyer or
 * city. Refuses to run unless PayPal is the sandbox.
 */
export default async function globalSetup() {
  if (!/^https:\/\/api-m\.sandbox\.paypal\.com\/?$/.test(process.env.PAYPAL_API_BASE ?? "")) {
    throw new Error("Refusing to run: PAYPAL_API_BASE must be the PayPal sandbox.");
  }
  const stamp = Date.now();
  const db = await connect();
  try {
    const runStart = new Date().toISOString();
    const main = { captureId: `E2E-${stamp}`, item: "E2E Test Handloom Saree", buyer: "E2E Test Buyer", city: "Chennai" };
    const sparse = { captureId: `E2E-SPARSE-${stamp}`, item: "E2E Sparse Sale" };
    const a = await db.query(
      `insert into transactions (paypal_order_id, paypal_capture_id, amount, currency, buyer_name, ship_to_city, ship_to_country, item_description, captured_at)
       values ($1,$2,'120.00','USD',$3,$4,'IN',$5, now()) returning id`,
      [`E2E-ORDER-${stamp}`, main.captureId, main.buyer, main.city, main.item]
    );
    const b = await db.query(
      `insert into transactions (paypal_order_id, paypal_capture_id, amount, currency, item_description, captured_at)
       values ($1,$2,'45.00','USD',$3, now()) returning id`,
      [`E2E-ORDER-SPARSE-${stamp}`, sparse.captureId, sparse.item]
    );
    const proofEvidenceId = await addTempProof(db);
    writeState({ runStart, main: { id: a.rows[0].id, ...main }, sparse: { id: b.rows[0].id, ...sparse }, proofEvidenceId });
    console.log(`E2E test sales created: ${main.captureId}, ${sparse.captureId}`);
  } finally {
    await db.end();
  }
}

/**
 * The dispute tests need a sale with verified proof to write a draft from. If the sale linked to the dispute has none,
 * add one small marked record (file "e2e-proof.json"). Teardown removes exactly that record.
 */
async function addTempProof(db: Awaited<ReturnType<typeof connect>>): Promise<string | undefined> {
  try {
    const list = (await (await fetch("http://localhost:3000/api/disputes")).json()) as Array<{ id: string }>;
    const id = process.env.E2E_DISPUTE_ID ?? list[0]?.id;
    if (!id) return undefined;
    const sale = (await db.query(`select transaction_id as id from disputes where paypal_dispute_id = $1 and transaction_id is not null`, [id])).rows[0]?.id as string | undefined;
    if (!sale) return undefined;
    const has = await db.query(
      `select 1 from transaction_evidence te join evidence_extractions x on x.evidence_id = te.evidence_id
       where te.transaction_id = $1 and x.field = 'tracking_number' and (x.status = 'verified' or x.confirmed_value is not null) limit 1`,
      [sale]
    );
    if (has.rowCount) return undefined;
    const body = Buffer.from(JSON.stringify({ type: "manual_entry", tracking_number: "EE123456785IN", carrier: "India Post", e2e: Date.now() }));
    const ev = await db.query(
      `insert into evidence (kind, file_name, mime_type, size_bytes, sha256, content) values ('courier_receipt','e2e-proof.json','application/json',$1,$2,$3) returning id`,
      [body.length, createHash("sha256").update(body).digest("hex"), body]
    );
    const evId = ev.rows[0].id as string;
    await db.query(`insert into evidence_extractions (evidence_id, field, ai_value, confirmed_value, status, check_note, model) values ($1,'tracking_number','EE123456785IN','EE123456785IN','verified','UPU S10 check digit matches','manual'), ($1,'carrier','India Post','India Post','needs_review','Seller confirms carrier','manual')`, [evId]);
    await db.query(`insert into transaction_evidence (transaction_id, evidence_id) values ($1,$2)`, [sale, evId]);
    return evId;
  } catch (e) {
    console.warn("E2E: could not add temporary proof for the dispute tests:", (e as Error).message);
    return undefined;
  }
}

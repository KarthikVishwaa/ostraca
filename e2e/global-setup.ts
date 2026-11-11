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
    writeState({ runStart, main: { id: a.rows[0].id, ...main }, sparse: { id: b.rows[0].id, ...sparse } });
    console.log(`E2E test sales created: ${main.captureId}, ${sparse.captureId}`);
  } finally {
    await db.end();
  }
}

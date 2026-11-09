/**
 * The Proof Graph, as a plain relational model.
 *
 *   transactions ──< transaction_evidence >── evidence ──< evidence_extractions
 *        │
 *        ├──< disputes
 *        └──< agent_actions (approval queue)        audit_logs (append-only)
 *
 * One piece of evidence can be linked to many uses (hold, dispute, limitation pack)
 * through transaction_evidence. The original file is never modified (sha256 stored).
 */
import {
  pgTable,
  text,
  integer,
  numeric,
  timestamp,
  jsonb,
  uuid,
  pgEnum,
  uniqueIndex,
  customType,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });

export const evidenceKind = pgEnum("evidence_kind", [
  "courier_receipt",
  "invoice",
  "chat_screenshot",
  "delivery_photo",
  "voice_note",
  "other",
]);

export const fieldStatus = pgEnum("field_status", ["verified", "needs_review", "rejected"]);

export const actionStatus = pgEnum("action_status", ["pending", "approved", "rejected", "executed", "failed"]);

export const transactions = pgTable("transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  sellerId: text("seller_id").notNull().default("demo-seller"),
  paypalOrderId: text("paypal_order_id").notNull(),
  paypalCaptureId: text("paypal_capture_id").notNull().unique(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency").notNull(),
  buyerName: text("buyer_name"),
  buyerEmail: text("buyer_email"),
  shipToCity: text("ship_to_city"),
  shipToCountry: text("ship_to_country"),
  itemDescription: text("item_description"),
  status: text("status").notNull().default("COMPLETED"),
  readinessScore: integer("readiness_score").notNull().default(0),
  trackingFiled: timestamp("tracking_filed_at", { withTimezone: true }),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const evidence = pgTable("evidence", {
  id: uuid("id").primaryKey().defaultRandom(),
  sellerId: text("seller_id").notNull().default("demo-seller"),
  kind: evidenceKind("kind").notNull().default("other"),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  sha256: text("sha256").notNull(),
  // Original bytes, never modified. Fine for the hackathon; move to private object storage later.
  content: bytea("content").notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  deleteAfter: timestamp("delete_after", { withTimezone: true }),
});

/** What the AI *suggested*, plus what code checked. One row per field. */
export const evidenceExtractions = pgTable("evidence_extractions", {
  id: uuid("id").primaryKey().defaultRandom(),
  evidenceId: uuid("evidence_id")
    .notNull()
    .references(() => evidence.id, { onDelete: "cascade" }),
  field: text("field").notNull(), // tracking_number, carrier, amount, currency, date, buyer_name, city, transcript...
  aiValue: text("ai_value"),
  confirmedValue: text("confirmed_value"), // set only when the seller confirms/edits
  status: fieldStatus("status").notNull().default("needs_review"),
  checkNote: text("check_note"), // why the validation engine accepted / flagged it
  model: text("model"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** The graph edges: evidence ↔ transaction, tagged with which uses it supports. */
export const transactionEvidence = pgTable(
  "transaction_evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    evidenceId: uuid("evidence_id")
      .notNull()
      .references(() => evidence.id, { onDelete: "cascade" }),
    usedFor: jsonb("used_for").$type<Array<"hold" | "dispute" | "limitation">>().notNull().default([]),
    linkedBy: text("linked_by").notNull().default("seller"), // seller | ai_suggested
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("tx_ev_unique").on(t.transactionId, t.evidenceId)]
);

export const disputes = pgTable("disputes", {
  id: uuid("id").primaryKey().defaultRandom(),
  paypalDisputeId: text("paypal_dispute_id").notNull().unique(),
  transactionId: uuid("transaction_id").references(() => transactions.id),
  reason: text("reason"),
  status: text("status"), // always the status PayPal reported — never assumed
  stage: text("stage"),
  outcome: text("outcome"),
  amount: numeric("amount", { precision: 12, scale: 2 }),
  currency: text("currency"),
  raw: jsonb("raw"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Human-approval queue. Every PayPal write goes through here. */
export const agentActions = pgTable("agent_actions", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type").notNull(), // add_tracking | provide_evidence | ...
  transactionId: uuid("transaction_id").references(() => transactions.id),
  disputeId: uuid("dispute_id").references(() => disputes.id),
  payload: jsonb("payload").notNull(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  status: actionStatus("status").notNull().default("pending"),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  paypalResponse: jsonb("paypal_response"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Append-only log of everything that happened. */
export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  actor: text("actor").notNull(), // seller | system | ai | paypal_webhook
  event: text("event").notNull(),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  details: jsonb("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Transaction = typeof transactions.$inferSelect;
export type Evidence = typeof evidence.$inferSelect;
export type EvidenceExtraction = typeof evidenceExtractions.$inferSelect;
export type Dispute = typeof disputes.$inferSelect;
export type AgentAction = typeof agentActions.$inferSelect;

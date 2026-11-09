import "server-only";
import { paypal } from "./client";

/** Transaction Search (used for the limitation pack). Max 31-day window per call. Sandbox data can lag ~hours. */
export function searchTransactions(start: Date, end: Date) {
  return paypal<{ transaction_details?: Array<{ transaction_info: Record<string, unknown>; payer_info?: Record<string, unknown> }> }>(
    "/v1/reporting/transactions",
    {
      query: {
        start_date: start.toISOString().replace(/\.\d{3}Z$/, "Z"),
        end_date: end.toISOString().replace(/\.\d{3}Z$/, "Z"),
        fields: "transaction_info,payer_info",
        page_size: 100,
      },
    }
  );
}

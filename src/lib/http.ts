import { errorResponse } from "@/lib/api";

/** Kept for the routes that already call it. All error text goes through errorResponse (safe message + PayPal debug_id only). */
export const paypalErrorResponse = errorResponse;

import { NextResponse } from "next/server";
import { listDisputes } from "@/lib/paypal/disputes";
import { hasLink } from "@/lib/paypal/client";
import { paypalErrorResponse } from "@/lib/http";

/** Lists sandbox disputes straight from PayPal, with the actions PayPal currently allows. */
export async function GET() {
  try {
    const { items = [] } = await listDisputes();
    return NextResponse.json(
      items.map((d) => ({
        id: d.dispute_id,
        reason: d.reason,
        status: d.status,
        stage: d.dispute_life_cycle_stage,
        amount: d.dispute_amount,
        created: d.create_time,
        can: {
          provideEvidence: hasLink(d.links, "provide_evidence"),
          acceptClaim: hasLink(d.links, "accept_claim"),
          makeOffer: hasLink(d.links, "make_offer"),
        },
      }))
    );
  } catch (e) {
    return paypalErrorResponse(e);
  }
}

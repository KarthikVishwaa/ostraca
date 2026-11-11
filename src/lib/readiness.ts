/**
 * Freeze Readiness Score — computed in code, explained (optionally) by AI. R = Σ wᵢ·cᵢ, cᵢ ∈ {0,1}.
 * Weights are a starting point; tune them as you build.
 */

export type ReadinessInput = {
  trackingFiled: boolean;
  hasVerifiedTracking: boolean;
  hasDeliveryProof: boolean;
  amountReconciled: boolean;
  buyerOrCityMatched: boolean;
  isService: boolean;
  hasInvoice: boolean;
};

export type ReadinessCheck = { key: string; label: string; weight: number; passed: boolean };

export function readiness(input: ReadinessInput) {
  const checks: ReadinessCheck[] = input.isService
    ? [
        { key: "invoice", label: "Invoice on file", weight: 35, passed: input.hasInvoice },
        { key: "delivery", label: "Proof of delivered work", weight: 35, passed: input.hasDeliveryProof },
        { key: "amount", label: "Amount reconciled with PayPal", weight: 20, passed: input.amountReconciled },
        { key: "buyer", label: "Client identity matched", weight: 10, passed: input.buyerOrCityMatched },
      ]
    : [
        { key: "tracking_verified", label: "Tracking number verified", weight: 25, passed: input.hasVerifiedTracking },
        { key: "tracking_filed", label: "Tracking filed with PayPal", weight: 30, passed: input.trackingFiled },
        { key: "delivery", label: "Delivery confirmed", weight: 20, passed: input.hasDeliveryProof },
        { key: "amount", label: "Amount reconciled with PayPal", weight: 15, passed: input.amountReconciled },
        { key: "buyer", label: "Buyer / city matched", weight: 10, passed: input.buyerOrCityMatched },
      ];
  const score = checks.reduce((s, c) => s + (c.passed ? c.weight : 0), 0);
  const level = score >= 80 ? "ready" : score >= 50 ? "partial" : "at_risk";
  return { score, level, checks, missing: checks.filter((c) => !c.passed).map((c) => c.label) } as const;
}

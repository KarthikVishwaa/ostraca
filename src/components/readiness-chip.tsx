import { Badge } from "@/components/ui/badge";

export const scoreLevel = (score: number) => (score >= 80 ? "ready" : score >= 50 ? "partial" : "at_risk") as "ready" | "partial" | "at_risk";
const VARIANT = { ready: "success", partial: "warning", at_risk: "destructive" } as const;
const WORD = { ready: "Ready", partial: "Partial", at_risk: "At risk" } as const;

/** Readiness as a chip. Carries a word as well as a colour, so it never relies on colour alone. */
export function ReadinessChip({ score, withWord = true }: { score: number; withWord?: boolean }) {
  const level = scoreLevel(score);
  return (
    <Badge variant={VARIANT[level]} className="tabular-nums">
      {score}
      {withWord && <span className="font-normal"> · {WORD[level]}</span>}
    </Badge>
  );
}

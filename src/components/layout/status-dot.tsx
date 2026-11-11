"use client";

import { useEffect, useState } from "react";
import { request } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type State = "checking" | "ok" | "problem";
const CHECK_MS = 60_000;

/** Small status light for the header. Reads /api/health when the page opens and once a minute while the tab is visible. */
export function StatusDot() {
  const [state, setState] = useState<State>("checking");

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const r = await request<Record<string, string>>("/api/health", { cache: "no-store" });
        if (!alive) return;
        if (!r.ok && r.error.code === "rate_limited") return; // too many asks is not a setup problem: keep the last state
        setState(r.ok && r.data.paypal === "ok" && r.data.database === "ok" ? "ok" : "problem");
      } catch {
        if (alive) setState("problem");
      }
    };
    check();
    const timer = setInterval(() => document.visibilityState === "visible" && check(), CHECK_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const label = state === "ok" ? "All systems working" : state === "problem" ? "Setup problem, open /api/health" : "Checking";
  return (
    <span className="flex items-center gap-1.5" role="status">
      <span
        className={cn("size-2.5 rounded-full", state === "ok" && "bg-success", state === "problem" && "bg-destructive", state === "checking" && "bg-muted-foreground/50")}
        aria-hidden
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}

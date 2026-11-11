"use client";

import { useRef } from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { AlertTriangle, CheckCircle2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NO_MOTION_QUERY, gsap, useGSAP } from "@/components/motion/gsap";
import type { TaskState } from "@/components/use-staged-task";
import { cn } from "@/lib/utils";

/**
 * Progress for a slow task: a real percentage, the current stage in words, the elapsed seconds, and, if it
 * fails, the real error with a Retry button. The percentage comes from stages the server actually streamed, never
 * from a timer. The bar moves with transform: scaleX (smoothed by GSAP; instant with prefers-reduced-motion).
 *
 * a11y: the bar is role="progressbar" with aria-valuenow; the stage text is a polite live region.
 */
export function TaskProgress({
  state,
  onRetry,
  onDismiss,
  title,
  className,
}: {
  state: TaskState<unknown>;
  onRetry?: () => void;
  onDismiss?: () => void;
  title: string;
  className?: string;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const { status, pct } = state;

  useGSAP(
    () => {
      const el = bar.current;
      if (!el) return;
      const mm = gsap.matchMedia();
      mm.add({ motion: NO_MOTION_QUERY }, (ctx) => {
        const to = Math.max(0, Math.min(100, pct)) / 100;
        if (!ctx.conditions?.motion) gsap.set(el, { scaleX: to });
        else gsap.to(el, { scaleX: to, duration: 0.45, ease: "power3.out", overwrite: true });
      });
    },
    { dependencies: [pct] }
  );

  if (status === "idle") return null;

  if (status === "error" && state.error) {
    const e = state.error;
    return (
      <div role="alert" data-testid="task-error" className={cn("space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm", className)}>
        <p className="flex items-start gap-2 font-medium text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {title} did not finish
        </p>
        <p className="break-words">{e.message}</p>
        {e.debugId && <p className="font-mono text-xs text-muted-foreground">PayPal debug_id: {e.debugId}</p>}
        {e.problems && e.problems.length > 0 && (
          <ul className="list-disc space-y-1 pl-5">
            {e.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          {onRetry && e.code !== "ai_paused" && (
            <Button size="sm" variant="outline" onClick={onRetry} className="w-full sm:w-auto">
              <RotateCw /> Retry
            </Button>
          )}
          {onDismiss && (
            <Button size="sm" variant="ghost" onClick={onDismiss} className="w-full sm:w-auto">
              Dismiss
            </Button>
          )}
        </div>
      </div>
    );
  }

  const done = status === "done";
  return (
    <div data-testid="task-progress" data-status={status} className={cn("space-y-1.5 rounded-md border bg-card p-3", className)}>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <p aria-live="polite" className="flex min-w-0 items-center gap-1.5 font-medium">
          {done && <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />}
          <span className="truncate">{done ? `${title}: done` : state.label || title}</span>
        </p>
        <p className="shrink-0 tabular-nums text-muted-foreground">
          <span data-testid="task-pct">{pct}%</span> · {state.elapsed}s
        </p>
      </div>
      <ProgressPrimitive.Root
        value={pct}
        max={100}
        aria-label={`${title} progress`}
        className="relative h-2 w-full overflow-hidden rounded-full bg-primary/20"
      >
        <ProgressPrimitive.Indicator ref={bar} className="h-full w-full origin-left rounded-full bg-primary" />
      </ProgressPrimitive.Root>
    </div>
  );
}

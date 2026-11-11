"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiErrorInfo, ApiResult, StageUpdate } from "@/lib/api-client";

export type TaskState<T> = {
  status: "idle" | "running" | "done" | "error";
  /** 0-100. It only reaches 100 when `status` is "done", i.e. when the result is really ready. */
  pct: number;
  label: string;
  elapsed: number; // whole seconds since the task started
  error: ApiErrorInfo | null;
  data: T | null;
};

const IDLE = { status: "idle", pct: 0, label: "", elapsed: 0, error: null, data: null } as const;

/**
 * Runs one slow task (an AI draft, an upload, an approval) and tracks real progress for it. const task =
 * useStagedTask<Draft>(); const r = await task.run((report) => requestStream("/api/...", init, report));
 */
export function useStagedTask<T>() {
  const [state, setState] = useState<TaskState<T>>(IDLE as TaskState<T>);
  const locked = useRef(false);
  const started = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const last = useRef<((report: (u: StageUpdate) => void) => Promise<ApiResult<T>>) | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  const run = useCallback(async (fn: (report: (u: StageUpdate) => void) => Promise<ApiResult<T>>): Promise<ApiResult<T> | null> => {
    if (locked.current) return null;
    locked.current = true;
    last.current = fn;
    started.current = Date.now();
    setState({ status: "running", pct: 1, label: "Starting", elapsed: 0, error: null, data: null });
    timer.current = setInterval(() => {
      if (alive.current) setState((s) => (s.status === "running" ? { ...s, elapsed: Math.floor((Date.now() - started.current) / 1000) } : s));
    }, 1000);
    try {
      const r = await fn((u) => {
        if (!alive.current) return;
        // Real stages only. Never backwards, and never 100 until the result exists.
        setState((s) => (s.status === "running" ? { ...s, pct: Math.max(s.pct, Math.min(99, Math.round(u.pct))), label: u.label || s.label } : s));
      });
      stop();
      const elapsed = Math.floor((Date.now() - started.current) / 1000);
      if (alive.current) {
        setState(r.ok ? { status: "done", pct: 100, label: "Done", elapsed, error: null, data: r.data } : { status: "error", pct: 0, label: "", elapsed, error: r.error, data: null });
      }
      return r;
    } finally {
      stop();
      locked.current = false;
    }
  }, []);

  const retry = useCallback(() => (last.current ? run(last.current) : Promise.resolve(null)), [run]);
  const reset = useCallback(() => {
    stop();
    locked.current = false;
    setState(IDLE as TaskState<T>);
  }, []);

  return { state, run, retry, reset, running: state.status === "running" };
}

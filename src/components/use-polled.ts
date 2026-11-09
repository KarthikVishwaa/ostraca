"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./sale-types";

/**
 * Loads a URL now, then again every `ms` while the tab is visible. The URL's route re-reads PayPal,
 * so what is on screen is never older than one interval. `refresh` forces an immediate re-read.
 */
export function usePolled<T>(url: string, ms = 10_000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      setData(await api<T>(url));
      setError(null);
      setUpdatedAt(new Date());
    } catch (e) {
      setError((e as Error).message); // keep showing the last good data
    } finally {
      inFlight.current = false;
    }
  }, [url]);

  useEffect(() => {
    refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, ms);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh, ms]);

  return { data, error, updatedAt, refresh };
}

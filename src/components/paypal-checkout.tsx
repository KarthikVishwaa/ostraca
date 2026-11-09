"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadScript, type PayPalNamespace } from "@paypal/paypal-js";
import { toast } from "sonner";

// Load the SDK once per page. Strict Mode's double effect and re-renders share this promise.
// A failed load clears the cache so "Try again" really retries.
let sdkPromise: Promise<PayPalNamespace | null> | null = null;
function loadSdk(clientId: string) {
  sdkPromise ??= loadScript({ clientId, currency: "USD", intent: "capture", components: "buttons" }).catch((e) => {
    sdkPromise = null;
    throw e;
  });
  return sdkPromise;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MAX_RETRIES = 2;

type State = { status: "loading" } | { status: "ready" } | { status: "error"; hint: string };

/** PayPal Smart Buttons (sandbox). Orders are created and captured on OUR server, never in the browser. */
export function PayPalCheckout({ amount, description }: { amount: string; description: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0); // bump to retry
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;

  const retry = useCallback(() => {
    sdkPromise = null;
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    let buttons: ReturnType<NonNullable<PayPalNamespace["Buttons"]>> | null = null;
    setState({ status: "loading" });

    (async () => {
      let paypal: PayPalNamespace | null = null;
      for (let i = 0; i <= MAX_RETRIES; i++) {
        try {
          paypal = await loadSdk(clientId);
          break;
        } catch (e) {
          if (cancelled) return;
          console.error(`PayPal loadScript failed (attempt ${i + 1}/${MAX_RETRIES + 1})`, e);
          if (i === MAX_RETRIES) return setState({ status: "error", hint: "loadScript failed (network or blocked script)" });
          await sleep(1000);
          if (cancelled) return;
        }
      }
      if (cancelled) return;
      if (!paypal?.Buttons || !ref.current) return setState({ status: "error", hint: "loadScript returned no Buttons" });

      try {
        buttons = paypal.Buttons({
          style: { layout: "vertical", shape: "rect" },
          createOrder: async () => {
            const r = await fetch("/api/paypal/orders", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ amount, currency: "USD", description }),
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error);
            return data.id;
          },
          onApprove: async ({ orderID }) => {
            const r = await fetch(`/api/paypal/orders/${orderID}/capture`, { method: "POST" });
            const data = await r.json();
            if (!r.ok) return void toast.error(`Capture failed: ${data.error}`);
            toast.success(`Paid. Capture ${data.captureId} added to your proof ledger.`);
          },
          onError: (err) => {
            console.error("PayPal button error", err);
            toast.error(String(err));
          },
        });
        await buttons.render(ref.current);
        if (!cancelled) setState({ status: "ready" });
      } catch (e) {
        if (cancelled) return; // expected when Strict Mode / navigation tears the effect down mid-render
        console.error("PayPal Buttons.render failed", e);
        setState({ status: "error", hint: `render failed: ${e instanceof Error ? e.message : String(e)}` });
      }
    })();

    return () => {
      cancelled = true;
      // close() lets the SDK remove its own DOM; we never touch innerHTML.
      Promise.resolve(buttons?.close()).catch(() => {});
      buttons = null;
    };
  }, [clientId, amount, description, attempt]);

  if (!clientId) return <p className="text-sm text-destructive">Set NEXT_PUBLIC_PAYPAL_CLIENT_ID in .env</p>;
  return (
    <div>
      {state.status === "loading" && <p className="text-sm text-muted-foreground">Loading PayPal…</p>}
      {state.status === "error" && (
        <div className="space-y-1 text-sm">
          <p className="text-destructive">Could not load PayPal buttons.</p>
          <p className="font-mono text-xs text-muted-foreground">{state.hint}</p>
          <button type="button" onClick={retry} className="underline underline-offset-2">
            Try again
          </button>
        </div>
      )}
      <div ref={ref} />
    </div>
  );
}

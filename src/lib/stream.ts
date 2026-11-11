import "server-only";
import { NextResponse } from "next/server";
import { errorResponse, toErrorInfo } from "@/lib/api";

/** Staged progress for slow routes (AI drafts, uploads, approvals). */
export type Emit = (stage: string, label: string, pct: number) => void;
export type Work<T> = (emit: Emit) => Promise<T>;

export const wantsStream = (req: Request) => (req.headers.get("accept") ?? "").includes("application/x-ndjson");

export async function respond<T>(req: Request, work: Work<T>): Promise<Response> {
  if (!wantsStream(req)) return NextResponse.json(await work(() => {})); // thrown errors reach the api() wrapper
  const enc = new TextEncoder();
  let lastPct = 0;
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let started = false;
  const queue: Uint8Array[] = [];
  const send = (o: unknown) => {
    const bytes = enc.encode(JSON.stringify(o) + "\n");
    if (!started) return void queue.push(bytes);
    try {
      controller.enqueue(bytes);
    } catch {
      /* the browser went away */
    }
  };
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  const close = () => {
    try {
      controller.close();
    } catch {
      /* already closed */
    }
  };

  // The work starts now. If it fails BEFORE it reports any stage, the answer is an ordinary JSON error with its real
  // HTTP status (404, 409, 413 ...). Once a stage has been reported the response is already a stream, so a later
  // failure arrives as an `error` event carrying the same status and message.
  let firstSignal!: () => void;
  const ready = new Promise<void>((r) => (firstSignal = r));
  let early: unknown = null;
  let streaming = false;
  const finished = work((stage, label, pct) => {
    lastPct = Math.max(lastPct, Math.min(99, Math.round(pct))); // monotonic, and 100 is reserved for the finished result
    send({ type: "stage", stage, label, pct: lastPct });
    streaming = true;
    firstSignal();
  }).then(
    (data) => {
      send({ type: "result", pct: 100, data });
      streaming = true;
      firstSignal();
    },
    (e) => {
      if (!streaming) early = e;
      else {
        const i = toErrorInfo(e);
        send({ type: "error", pct: lastPct, status: i.status, error: { message: i.message, code: i.code, ...(i.debugId ? { debugId: i.debugId } : {}) }, ...(i.extra ?? {}) });
      }
      firstSignal();
    }
  );

  await ready;
  if (early !== null) return errorResponse(early);
  started = true;
  for (const b of queue) controller.enqueue(b);
  queue.length = 0;
  void finished.then(close);
  return new Response(body, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}

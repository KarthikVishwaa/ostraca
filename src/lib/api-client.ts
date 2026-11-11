/**
 * The one way the browser talks to our API. It never assumes a response is JSON or has a given error shape, and
 * never throws: every call resolves to { ok, data, error } with error = { message, code, debugId, status }.
 */

export type ApiErrorInfo = {
  message: string;
  code: string;
  debugId?: string;
  status: number;
  retryAfter?: number;
  problems?: string[];
};
export type ApiResult<T> = { ok: true; data: T; error: null } | { ok: false; data: null; error: ApiErrorInfo };
export type StageUpdate = { stage: string; label: string; pct: number };

const ok = <T>(data: T): ApiResult<T> => ({ ok: true, data, error: null });
const fail = <T = never>(error: ApiErrorInfo): ApiResult<T> => ({ ok: false, data: null, error });

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/** Builds a safe error from whatever the server sent (our shape, a legacy string, HTML, nothing). */
export function toApiError(status: number, body: unknown, statusText = ""): ApiErrorInfo {
  const e = isObj(body) ? body.error : undefined;
  let message = "";
  let code = "";
  let debugId: string | undefined;
  if (typeof e === "string") message = e;
  else if (isObj(e)) {
    message = typeof e.message === "string" ? e.message : "";
    code = typeof e.code === "string" ? e.code : "";
    debugId = typeof e.debugId === "string" ? e.debugId : typeof e.debug_id === "string" ? e.debug_id : undefined;
  }
  if (!debugId && isObj(body) && typeof body.debug_id === "string") debugId = body.debug_id;
  if (!message) {
    message =
      status === 429
        ? "Too many requests. Please try again in a moment."
        : status >= 500
          ? `The server had a problem (HTTP ${status}). Please try again.`
          : status === 404
            ? "That was not found."
            : `The request failed (HTTP ${status}${statusText ? ` ${statusText}` : ""}).`;
  }
  const retryAfter = isObj(body) && typeof body.retryAfter === "number" ? body.retryAfter : undefined;
  const problems = isObj(body) && Array.isArray(body.problems) ? body.problems.filter((p): p is string => typeof p === "string") : undefined;
  return { message, code: code || (status === 429 ? "rate_limited" : status >= 500 ? "server_error" : "request_failed"), debugId, status, retryAfter, problems };
}

const networkError = (): ApiErrorInfo => ({ message: "Could not reach the server. Check your connection and try again.", code: "network", status: 0 });

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null; // HTML error page, plain text, anything else
  }
}

export async function request<T = unknown>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    return fail(networkError());
  }
  const body = await readJson(res);
  if (!res.ok) return fail(toApiError(res.status, body, res.statusText));
  return ok((body ?? {}) as T);
}

/** Reads NDJSON lines from a stream. Calls `onEvent` for each parsed object; ignores lines that are not JSON. */
async function readNdjson(res: Response, onEvent: (o: Record<string, unknown>) => void) {
  const reader = res.body?.getReader();
  if (!reader) return;
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buf += dec.decode(value, { stream: !done });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) feedLine(line, onEvent);
    if (done) break;
  }
  feedLine(buf, onEvent);
}
function feedLine(line: string, onEvent: (o: Record<string, unknown>) => void) {
  const t = line.trim();
  if (!t) return;
  try {
    const o = JSON.parse(t);
    if (isObj(o)) onEvent(o);
  } catch {
    /* a torn or non-JSON line: skip it */
  }
}

/** Turns the events of one stream into a result. Shared by fetch and XHR. */
function collector<T>(onStage?: (u: StageUpdate) => void) {
  let result: ApiResult<T> | null = null;
  const handle = (o: Record<string, unknown>) => {
    if (o.type === "stage" && typeof o.pct === "number") onStage?.({ stage: String(o.stage ?? ""), label: String(o.label ?? ""), pct: o.pct });
    else if (o.type === "result") result = ok((o.data ?? {}) as T);
    else if (o.type === "error") result = fail(toApiError(typeof o.status === "number" ? o.status : 502, { error: o.error, retryAfter: o.retryAfter, problems: o.problems }));
  };
  const finish = (): ApiResult<T> => result ?? fail({ message: "The connection ended before the answer arrived. Please try again.", code: "stream_ended", status: 0 });
  return { handle, finish };
}

/** Like `request`, but asks for staged progress. Falls back to a plain JSON answer if the server does not stream. */
export async function requestStream<T = unknown>(url: string, init: RequestInit | undefined, onStage?: (u: StageUpdate) => void): Promise<ApiResult<T>> {
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/x-ndjson");
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers });
  } catch {
    return fail(networkError());
  }
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("ndjson")) {
    // Not a stream (an error before the work started, or a server that does not stream): treat as one JSON answer.
    const body = await readJson(res);
    return res.ok ? ok((body ?? {}) as T) : fail(toApiError(res.status, body, res.statusText));
  }
  const c = collector<T>(onStage);
  try {
    await readNdjson(res, c.handle);
  } catch {
    return fail(networkError());
  }
  return c.finish();
}

/**
 * Upload with real progress. The browser's own upload progress fills 0-28% (the "uploading" stage), then
 * the server's stages (hashing, reading, checking, saving) continue from there.
 */
export function uploadStream<T = unknown>(url: string, form: FormData, onStage?: (u: StageUpdate) => void): Promise<ApiResult<T>> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    const c = collector<T>(onStage);
    let seen = 0;
    let pending = "";
    xhr.open("POST", url);
    xhr.setRequestHeader("Accept", "application/x-ndjson");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onStage?.({ stage: "uploading", label: "Uploading the file", pct: Math.min(28, Math.round((e.loaded / e.total) * 28)) });
    };
    xhr.upload.onload = () => onStage?.({ stage: "uploading", label: "Uploading the file", pct: 28 });
    xhr.onprogress = () => {
      if (!(xhr.getResponseHeader("content-type") ?? "").includes("ndjson")) return;
      const chunk = xhr.responseText.slice(seen);
      seen = xhr.responseText.length;
      pending += chunk;
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const l of lines) feedLine(l, c.handle);
    };
    xhr.onerror = () => resolve(fail(networkError()));
    xhr.ontimeout = () => resolve(fail(networkError()));
    xhr.onload = () => {
      const type = xhr.getResponseHeader("content-type") ?? "";
      if (type.includes("ndjson")) {
        // Whatever the progress events had not consumed yet (a torn last line plus the newest text).
        for (const l of (pending + xhr.responseText.slice(seen)).split("\n")) feedLine(l, c.handle);
        resolve(c.finish());
        return;
      }
      let body: unknown = null;
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        body = null;
      }
      resolve(xhr.status >= 200 && xhr.status < 300 ? ok((body ?? {}) as T) : fail(toApiError(xhr.status, body, xhr.statusText)));
    };
    xhr.send(form);
  });
}

/**
 * CSRF defence for state-changing requests: the browser always sends an Origin (or at least a Referer) on
 * a cross-site POST, and it must match this app.
 */
export function isSameOrigin(req: Request, appUrl: string | undefined) {
  const sent = req.headers.get("origin") ?? safeOrigin(req.headers.get("referer"));
  if (!sent || sent === "null") return false;
  const allowed = new Set<string>();
  if (appUrl) allowed.add(safeOrigin(appUrl) ?? "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host) {
    const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
    allowed.add(`${proto}://${host}`);
  }
  return allowed.has(sent);
}

function safeOrigin(u: string | null) {
  if (!u) return null;
  try {
    return new URL(u).origin;
  } catch {
    return null;
  }
}

export const isStateChanging = (method: string) => !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());

/**
 * Turn DATABASE_URL into explicit node-postgres settings.
 *
 * - SSL is decided here once, instead of the URL's `sslmode` and a separate `ssl`
 *   option both applying (and pg printing its sslmode deprecation warning).
 * - `channel_binding` is dropped: Neon adds it to copied URLs, but node-postgres
 *   doesn't need it and it can break the handshake on some versions.
 * No imports, so drizzle.config.ts and scripts can use it too.
 */
export function pgSettings(raw: string) {
  const url = new URL(raw.trim().replace(/^["']|["']$/g, ""));
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);
  const sslmode = url.searchParams.get("sslmode");
  url.searchParams.delete("sslmode");
  url.searchParams.delete("channel_binding");
  const ssl = local || sslmode === "disable" ? false : { rejectUnauthorized: true };
  return {
    connectionString: url.toString(),
    ssl,
    host: url.hostname,
    port: url.port ? Number(url.port) : 5432,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
  };
}

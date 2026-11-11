/** Turn DATABASE_URL into explicit node-postgres settings. */
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

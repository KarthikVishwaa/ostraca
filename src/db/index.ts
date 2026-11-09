import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import { env } from "@/lib/env";
import { pgSettings } from "./url";

declare global {
  // Reuse one pool across hot reloads in dev.
  var __ostracaPool: Pool | undefined;
}

function pool() {
  if (!globalThis.__ostracaPool) {
    const { connectionString, ssl } = pgSettings(env().DATABASE_URL);
    globalThis.__ostracaPool = new Pool({
      connectionString,
      ssl, // Neon and Render Postgres require TLS; decided once in pgSettings.
      max: 5,
      // Fail fast with a real error instead of hanging (Neon wakes from sleep in ~1-3s).
      connectionTimeoutMillis: 15_000,
    });
  }
  return globalThis.__ostracaPool;
}

export const db = () => drizzle(pool(), { schema });
export { schema };

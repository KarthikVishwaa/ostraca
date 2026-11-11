import "dotenv/config";
import { Client } from "pg";
import { pgSettings } from "../src/db/url";

/** A direct database connection for test setup and teardown only. */
export async function connect() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
  const { connectionString, ssl } = pgSettings(process.env.DATABASE_URL);
  const client = new Client({ connectionString, ssl, connectionTimeoutMillis: 20_000 });
  await client.connect();
  return client;
}

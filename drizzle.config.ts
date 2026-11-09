import "dotenv/config";
import { defineConfig } from "drizzle-kit";
import { pgSettings } from "./src/db/url";

const { host, port, user, password, database, ssl } = pgSettings(process.env.DATABASE_URL!);

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { host, port, user, password, database, ssl },
});

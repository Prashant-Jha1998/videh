import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const shouldUseSsl = (() => {
  const forceSsl = process.env.PGSSLMODE?.toLowerCase() === "require";
  const isProduction = process.env.NODE_ENV === "production";
  const isNeonHost = databaseUrl.includes(".neon.tech");
  const connectionStringRequiresSsl = databaseUrl
    .toLowerCase()
    .includes("sslmode=require");

  return forceSsl || isProduction || isNeonHost || connectionStringRequiresSsl;
})();

export const pool = new Pool({
  connectionString: databaseUrl,
  ssl: shouldUseSsl ? { rejectUnauthorized: false } : false,
});
export const db = drizzle(pool, { schema });

export * from "./schema";

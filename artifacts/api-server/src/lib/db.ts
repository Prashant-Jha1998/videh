import { Pool } from "pg";
import { logger } from "./logger";

const databaseUrl = process.env["DATABASE_URL"];

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to connect to PostgreSQL.");
}

const shouldUseSsl = (() => {
  const forceSsl = process.env["PGSSLMODE"]?.toLowerCase() === "require";
  const isProduction = process.env["NODE_ENV"] === "production";
  const isNeonHost = databaseUrl.includes(".neon.tech");
  const connectionStringRequiresSsl = databaseUrl
    .toLowerCase()
    .includes("sslmode=require");

  return forceSsl || isProduction || isNeonHost || connectionStringRequiresSsl;
})();

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: shouldUseSsl ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on("error", (err) => {
  logger.error({ err }, "PostgreSQL pool error");
});

export const query = async (text: string, params?: any[]) => {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (duration > 1000) logger.warn({ text, duration }, "Slow query");
  return res;
};

export default pool;

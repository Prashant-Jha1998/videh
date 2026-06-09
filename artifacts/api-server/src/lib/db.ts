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

function resolvePoolMax(): number {
  const raw = Number(process.env["PG_POOL_MAX"] || process.env["DATABASE_POOL_MAX"] || "0");
  if (Number.isFinite(raw) && raw > 0) return Math.min(Math.floor(raw), 100);
  // Default per worker — with PM2 cluster, total ≈ workers × 15 (stay under RDS max_connections).
  return 15;
}

const poolMax = resolvePoolMax();

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: shouldUseSsl ? { rejectUnauthorized: false } : false,
  max: poolMax,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on("error", (err) => {
  logger.error({ err }, "PostgreSQL pool error");
});

export function getPoolStats() {
  return {
    max: poolMax,
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  };
}

export const query = async (text: string, params?: any[]) => {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (duration > 1000) logger.warn({ text, duration }, "Slow query");
  return res;
};

export default pool;

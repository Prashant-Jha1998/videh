import { Pool } from "pg";
import { logger } from "./logger";

const pool = new Pool({
  connectionString: process.env["DATABASE_URL"],
  ssl: process.env["NODE_ENV"] === "production" ? { rejectUnauthorized: false } : false,
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

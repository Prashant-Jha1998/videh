import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { getPoolStats, query } from "../lib/db";
import { isRedisBusEnabled, pingRedisBus } from "../lib/redisBus";
import { isS3MediaEnabled, pingS3Bucket } from "../lib/s3Storage";
import { stateDelete, stateGetJson, stateSetJson } from "../lib/sharedState";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/readyz", async (_req, res) => {
  const checks: Record<string, { ok: boolean; message?: string }> = {};
  try {
    await query("SELECT 1");
    checks["database"] = { ok: true };
  } catch (err) {
    checks["database"] = { ok: false, message: err instanceof Error ? err.message : "database failed" };
  }

  try {
    const key = `readyz:${process.pid}:${Date.now()}`;
    await stateSetJson(key, { ok: true }, 10_000);
    const value = await stateGetJson<{ ok: boolean }>(key);
    await stateDelete(key);
    checks["sharedState"] = { ok: value?.ok === true };
  } catch (err) {
    checks["sharedState"] = { ok: false, message: err instanceof Error ? err.message : "shared state failed" };
  }

  checks["sessionSecret"] = {
    ok: Boolean(process.env["SESSION_SECRET"] || process.env["JWT_SECRET"]),
    message: process.env["SESSION_SECRET"] || process.env["JWT_SECRET"] ? undefined : "SESSION_SECRET or JWT_SECRET should be set in production",
  };
  checks["mediaPublicBase"] = {
    ok: Boolean(process.env["MEDIA_PUBLIC_BASE_URL"] || process.env["CDN_BASE_URL"]),
    message: process.env["MEDIA_PUBLIC_BASE_URL"] || process.env["CDN_BASE_URL"] ? undefined : "Set MEDIA_PUBLIC_BASE_URL/CDN_BASE_URL for production media delivery",
  };

  if (isRedisBusEnabled()) {
    const redisOk = await pingRedisBus();
    checks["redis"] = {
      ok: redisOk,
      message: redisOk ? undefined : "REDIS_URL set but ping failed — SSE will not work across instances",
    };
  }

  if (isS3MediaEnabled()) {
    const s3Ok = await pingS3Bucket();
    checks["s3"] = {
      ok: s3Ok,
      message: s3Ok ? undefined : "AWS_S3_BUCKET set but HeadBucket failed — check IAM and bucket region",
    };
  }

  const pool = getPoolStats();
  checks["dbPool"] = {
    ok: pool.waiting < pool.max,
    message: pool.waiting > 0 ? `pool waiting=${pool.waiting} total=${pool.total}/${pool.max}` : undefined,
  };

  // Deploy health gate: database must be up; Redis/S3/CDN are reported but non-blocking.
  const ok = checks["database"]?.ok === true;
  res.status(ok ? 200 : 503).json({ status: ok ? "ready" : "not_ready", checks });
});

export default router;

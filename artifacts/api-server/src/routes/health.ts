import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { query } from "../lib/db";
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

  const ok = Object.values(checks).every((check) => check.ok);
  res.status(ok ? 200 : 503).json({ status: ok ? "ready" : "not_ready", checks });
});

export default router;

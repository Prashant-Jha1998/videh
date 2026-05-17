import type { Request } from "express";
import { query } from "./db";
import { ensureAdminPlatformTables } from "./adminPlatform";
import type { AdminIdentity } from "./adminSession";

export type AdminAuditPayload = {
  action: string;
  entityType: string;
  entityId?: string | number | null;
  metadata?: Record<string, unknown>;
};

function adminFromReq(req?: Request): AdminIdentity {
  const a = req?.admin as AdminIdentity | undefined;
  if (a?.email) return a;
  return {
    adminId: null,
    email: process.env["ADMIN_EMAIL"]?.trim().toLowerCase() ?? "platform-admin",
    role: "super_admin",
  };
}

function clientIp(req?: Request): string | null {
  if (!req) return null;
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length > 0) return xf.split(",")[0]?.trim() ?? null;
  return req.socket?.remoteAddress ?? null;
}

export async function logAdminAction(payload: AdminAuditPayload, req?: Request): Promise<void> {
  await ensureAdminPlatformTables();
  await query(
    `INSERT INTO admin_audit_log (admin_email, admin_role, action, entity_type, entity_id, metadata, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
    [
      adminFromReq(req).email,
      adminFromReq(req).role,
      payload.action,
      payload.entityType,
      payload.entityId != null ? String(payload.entityId) : null,
      JSON.stringify(payload.metadata ?? {}),
      clientIp(req),
    ],
  );
}

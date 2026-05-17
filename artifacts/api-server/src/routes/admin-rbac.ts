import type { Router, Request, Response, NextFunction } from "express";
import type { AdminIdentity } from "../lib/adminSession";
import { roleHasPermission, isAdminRole, ADMIN_ROLES, type AdminPermission, type AdminRole } from "../lib/adminRbac";
import { createAdminUser, listAdminUsers } from "../lib/adminUsers";
import { hashAdminPassword } from "../lib/adminPassword";
import { logAdminAction } from "../lib/adminAudit";
import { query } from "../lib/db";
import { logger } from "../lib/logger";

export type RequireAdminFn = (req: Request, res: Response, next: NextFunction) => void;
export type RequireAdmin = RequireAdminFn;

export function requirePermission(permission: AdminPermission) {
  return (req: Request, res: Response, next: NextFunction) => {
    const admin = req.admin as AdminIdentity | undefined;
    if (!admin) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }
    if (!roleHasPermission(admin.role, permission)) {
      res.status(403).json({ success: false, message: "Insufficient permissions for this action." });
      return;
    }
    next();
  };
}

export function registerAdminRbacRoutes(router: Router, requireAdmin: RequireAdmin): void {
  router.get("/admins", requireAdmin, requirePermission("admins.manage"), async (_req, res) => {
    try {
      const rows = await listAdminUsers();
      res.json({
        success: true,
        admins: rows.map((a) => ({
          id: a.id,
          email: a.email,
          role: a.role,
          display_name: a.display_name,
          is_active: a.is_active,
          has_totp: Boolean(a.totp_secret),
        })),
        roles: ADMIN_ROLES,
      });
    } catch (err) {
      logger.error({ err }, "admin list admins");
      res.status(500).json({ success: false, message: "Could not list admins" });
    }
  });

  router.post("/admins", requireAdmin, requirePermission("admins.manage"), async (req, res) => {
    const body = req.body as {
      email?: string;
      password?: string;
      role?: string;
      totpSecret?: string;
      displayName?: string;
    };
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const role = String(body.role ?? "moderator");
    if (!email || password.length < 10) {
      res.status(400).json({ success: false, message: "email and password (min 10 chars) required" });
      return;
    }
    if (!isAdminRole(role)) {
      res.status(400).json({ success: false, message: `role must be one of: ${ADMIN_ROLES.join(", ")}` });
      return;
    }
    try {
      const created = await createAdminUser({
        email,
        password,
        role: role as AdminRole,
        totpSecret: body.totpSecret,
        displayName: body.displayName,
      });
      await logAdminAction(
        { action: "admin_user_create", entityType: "admin_user", entityId: created.id, metadata: { email, role } },
        req,
      );
      res.json({
        success: true,
        admin: { id: created.id, email: created.email, role: created.role },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error && err.message.includes("unique") ? "Email already exists" : "Create failed";
      logger.error({ err }, "admin create admin user");
      res.status(500).json({ success: false, message: msg });
    }
  });

  router.patch("/admins/:id", requireAdmin, requirePermission("admins.manage"), async (req, res) => {
    const id = Number(req.params.id);
    const body = req.body as { role?: string; isActive?: boolean; password?: string; totpSecret?: string | null };
    if (!id) {
      res.status(400).json({ success: false, message: "Invalid id" });
      return;
    }
    const updates: string[] = ["updated_at = NOW()"];
    const params: unknown[] = [];
    let i = 1;

    if (body.role !== undefined) {
      if (!isAdminRole(body.role)) {
        res.status(400).json({ success: false, message: "Invalid role" });
        return;
      }
      updates.push(`role = $${i++}`);
      params.push(body.role);
    }
    if (body.isActive !== undefined) {
      updates.push(`is_active = $${i++}`);
      params.push(body.isActive);
    }
    if (body.password && body.password.length >= 10) {
      updates.push(`password_hash = $${i++}`);
      params.push(await hashAdminPassword(body.password));
    }
    if (body.totpSecret !== undefined) {
      updates.push(`totp_secret = $${i++}`);
      params.push(body.totpSecret?.trim() || null);
    }

    params.push(id);
    try {
      const r = await query(
        `UPDATE admin_users SET ${updates.join(", ")} WHERE id = $${i} RETURNING id, email, role, is_active`,
        params,
      );
      if (!r.rows[0]) {
        res.status(404).json({ success: false, message: "Admin not found" });
        return;
      }
      await logAdminAction({ action: "admin_user_update", entityType: "admin_user", entityId: id }, req);
      res.json({ success: true, admin: r.rows[0] });
    } catch (err) {
      logger.error({ err }, "admin patch admin user");
      res.status(500).json({ success: false, message: "Update failed" });
    }
  });
}

export async function resolveTotpSecretForAdmin(adminId: number | null): Promise<string | null> {
  if (adminId == null) {
    return process.env["ADMIN_TOTP_SECRET"]?.trim() || null;
  }
  const r = await query(`SELECT totp_secret FROM admin_users WHERE id = $1 AND is_active = TRUE`, [adminId]);
  const secret = (r.rows[0] as { totp_secret?: string | null })?.totp_secret;
  if (secret) return secret;
  return process.env["ADMIN_TOTP_SECRET"]?.trim() || null;
}

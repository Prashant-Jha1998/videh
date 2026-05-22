import type { Router, Request, Response, NextFunction } from "express";
import { query } from "../lib/db";
import { logger } from "../lib/logger";
import { ensureAdminPlatformTables, grievanceTicketNumber, legalReferenceNumber, grievanceSlaTimestamps } from "../lib/adminPlatform";
import { logAdminAction } from "../lib/adminAudit";
import { computeReportPriority, priorityLabel } from "../lib/reportPriority";
import { getUserRiskScore, suggestModerationAction } from "../lib/riskScoring";
import type { AdminIdentity } from "../lib/adminSession";
import { requirePermission, type RequireAdmin } from "./admin-rbac";
import crypto from "node:crypto";
import { DEVELOPER_STATUSES, ensureDeveloperLeadsTable } from "./developer-leads";
import { documentsForEntity } from "../lib/developerPlatform";
import {
  buildTemplateInsertParams,
  ensureDeveloperTemplateTables,
  linkTemplatesToAccount,
} from "../lib/developerTemplates";
import { encryptApiSecret, hashApiSecret } from "../lib/developerApiSecretVault";
import {
  copyChannelToAccount,
  ensureDeveloperChannelColumns,
  generateBusinessAccountId,
  generatePhoneNumberId,
} from "../lib/developerChannel";
import { deleteDeveloperLeadById } from "../lib/deleteDeveloperLead";

function adminEmail(req: Request): string {
  const a = req.admin as AdminIdentity | undefined;
  return a?.email ?? process.env["ADMIN_EMAIL"]?.trim().toLowerCase() ?? "platform-admin";
}

async function enrichReportRow(row: Record<string, unknown>): Promise<Record<string, unknown>> {
  const reportedUserId = row.reported_user_id != null ? Number(row.reported_user_id) : null;
  let reportedUserRisk = 0;
  let reportedUserStrikes = 0;
  let reportedUserSuspended = false;
  let duplicateReports7d = 0;

  if (reportedUserId) {
    const risk = await getUserRiskScore(reportedUserId);
    reportedUserRisk = risk.score;
    reportedUserStrikes = risk.signals.strikeCount;
    reportedUserSuspended =
      risk.signals.permanentlySuspended ||
      Boolean(row.reported_suspended_until && new Date(String(row.reported_suspended_until)) > new Date());

    const dup = await query(
      `SELECT COUNT(*)::int AS c FROM user_reports
       WHERE reported_user_id = $1 AND created_at > NOW() - INTERVAL '7 days'`,
      [reportedUserId],
    );
    duplicateReports7d = Number((dup.rows[0] as { c: number })?.c ?? 0);
  }

  const priority = computeReportPriority({
    createdAt: new Date(String(row.created_at)),
    reason: String(row.reason ?? ""),
    details: row.details != null ? String(row.details) : null,
    blockAfterReport: Boolean(row.block_after_report),
    duplicateReports7d,
    reportedUserRisk,
    reportedUserStrikes,
    reportedUserSuspended,
  });

  return {
    ...row,
    priority_score_computed: priority,
    priority_label: priorityLabel(priority),
    reported_user_risk: reportedUserRisk,
    duplicate_reports_7d: duplicateReports7d,
  };
}

async function applyAdminSuspension(
  userId: number,
  action: "warn" | "suspend_24h" | "suspend_7d" | "permanent_ban",
  reason: string,
  req: Request,
): Promise<void> {
  const existing = await query(
    `SELECT strike_count, permanently_suspended FROM user_moderation_state WHERE user_id = $1`,
    [userId],
  );
  let strikes = Number((existing.rows[0] as { strike_count?: number })?.strike_count ?? 0);

  let suspendedUntil: string | null = null;
  let permanent = false;
  let actionTaken = "admin_warn";

  if (action === "warn") {
    strikes += 1;
    actionTaken = "admin_warn";
  } else if (action === "suspend_24h") {
    strikes += 1;
    suspendedUntil = new Date(Date.now() + 24 * 3_600_000).toISOString();
    actionTaken = "admin_suspend_24h";
  } else if (action === "suspend_7d") {
    strikes += 1;
    suspendedUntil = new Date(Date.now() + 7 * 24 * 3_600_000).toISOString();
    actionTaken = "admin_suspend_7d";
  } else if (action === "permanent_ban") {
    strikes += 1;
    permanent = true;
    actionTaken = "admin_permanent_ban";
  }

  await query(
    `INSERT INTO user_moderation_state (user_id, strike_count, suspended_until, permanently_suspended, last_reason, updated_at)
     VALUES ($1, $2, $3::timestamptz, $4, $5, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       strike_count = GREATEST(user_moderation_state.strike_count, EXCLUDED.strike_count),
       suspended_until = CASE WHEN EXCLUDED.permanently_suspended THEN NULL ELSE COALESCE(EXCLUDED.suspended_until, user_moderation_state.suspended_until) END,
       permanently_suspended = user_moderation_state.permanently_suspended OR EXCLUDED.permanently_suspended,
       last_reason = EXCLUDED.last_reason,
       updated_at = NOW()`,
    [userId, strikes, suspendedUntil, permanent, reason],
  );

  await query(
    `INSERT INTO moderation_events (user_id, activity_type, reason, excerpt, severity, action_taken)
     VALUES ($1, 'admin_action', $2, NULL, 'high', $3)`,
    [userId, reason, actionTaken],
  );

  await logAdminAction(
    { action: actionTaken, entityType: "user", entityId: userId, metadata: { reason } },
    req,
  );
}

export function registerAdminPlatformRoutes(router: Router, requireAdmin: RequireAdmin): void {
  router.get("/compliance-stats", requireAdmin, requirePermission("stats.read"), async (_req, res) => {
    try {
      await ensureAdminPlatformTables();
      const r = await query(
        `SELECT
          (SELECT COUNT(*)::int FROM user_reports WHERE COALESCE(status, 'open') = 'open') AS open_reports,
          (SELECT COUNT(*)::int FROM grievance_tickets WHERE status IN ('open', 'in_progress')) AS open_grievances,
          (SELECT COUNT(*)::int FROM grievance_tickets
           WHERE status IN ('open', 'in_progress') AND sla_ack_due_at < NOW() AND first_response_at IS NULL) AS grievances_sla_breach,
          (SELECT COUNT(*)::int FROM legal_requests WHERE status NOT IN ('fulfilled', 'rejected')) AS open_legal,
          (SELECT COUNT(*)::int FROM data_subject_requests WHERE status NOT IN ('completed', 'rejected')) AS open_dsr,
          (SELECT COUNT(*)::int FROM platform_incidents WHERE status != 'resolved') AS active_incidents`,
        [],
      );
      res.json({ success: true, compliance: r.rows[0] });
    } catch (err) {
      logger.error({ err }, "admin compliance-stats");
      res.status(500).json({ success: false, message: "Compliance stats failed" });
    }
  });

  router.get("/reports", requireAdmin, requirePermission("reports.read"), async (req, res) => {
    const status = String(req.query["status"] ?? "open");
    const limit = Math.min(200, Math.max(1, Number(req.query["limit"]) || 80));
    const safeStatus = ["open", "in_review", "resolved", "dismissed", "all"].includes(status) ? status : "open";
    try {
      await ensureAdminPlatformTables();
      const params: unknown[] = [limit];
      let where = "1=1";
      if (safeStatus !== "all") {
        where = "COALESCE(ur.status, 'open') = $2";
        params.push(safeStatus);
      }
      const r = await query(
        `SELECT ur.*,
                ru.phone AS reported_phone, ru.name AS reported_name,
                rp.phone AS reporter_phone, rp.name AS reporter_name,
                ms.suspended_until AS reported_suspended_until,
                ms.strike_count AS reported_strikes
         FROM user_reports ur
         LEFT JOIN users ru ON ru.id = ur.reported_user_id
         LEFT JOIN users rp ON rp.id = ur.reporter_id
         LEFT JOIN user_moderation_state ms ON ms.user_id = ur.reported_user_id
         WHERE ${where}
         ORDER BY ur.created_at DESC
         LIMIT $1`,
        params,
      );

      const enriched = await Promise.all(
        (r.rows as Record<string, unknown>[]).map(async (row) => {
          const full = await enrichReportRow(row);
          const score = Number(full.priority_score_computed);
          if (score !== Number(row.priority_score)) {
            await query(`UPDATE user_reports SET priority_score = $1 WHERE id = $2`, [score, row.id]);
          }
          return full;
        }),
      );

      enriched.sort(
        (a, b) => Number(b.priority_score_computed) - Number(a.priority_score_computed),
      );

      res.json({ success: true, reports: enriched });
    } catch (err) {
      logger.error({ err }, "admin /reports");
      res.status(500).json({ success: false, message: "Could not load reports" });
    }
  });

  router.post("/reports/:reportId/assign", requireAdmin, requirePermission("reports.manage"), async (req, res) => {
    const reportId = Number(req.params.reportId);
    if (!reportId) {
      res.status(400).json({ success: false, message: "Invalid reportId" });
      return;
    }
    try {
      await ensureAdminPlatformTables();
      await query(
        `UPDATE user_reports SET status = 'in_review', assigned_admin = $2 WHERE id = $1`,
        [reportId, adminEmail(req)],
      );
      await logAdminAction({ action: "report_assign", entityType: "user_report", entityId: reportId }, req);
      res.json({ success: true });
    } catch (err) {
      logger.error({ err }, "admin report assign");
      res.status(500).json({ success: false, message: "Assign failed" });
    }
  });

  router.post("/reports/:reportId/resolve", requireAdmin, requirePermission("reports.manage"), async (req, res) => {
    const reportId = Number(req.params.reportId);
    const body = req.body as { resolution?: string; adminAction?: string; dismiss?: boolean };
    const note = String(body.resolution ?? "").trim();
    if (!reportId || !note) {
      res.status(400).json({ success: false, message: "reportId and resolution note required" });
      return;
    }
    const status = body.dismiss ? "dismissed" : "resolved";
    try {
      await ensureAdminPlatformTables();
      await query(
        `UPDATE user_reports
         SET status = $2, resolution_note = $3, admin_action = $4, reviewed_at = NOW(), assigned_admin = $5
         WHERE id = $1`,
        [reportId, status, note, body.adminAction ?? null, adminEmail(req)],
      );
      await logAdminAction(
        { action: `report_${status}`, entityType: "user_report", entityId: reportId, metadata: { note } },
        req,
      );
      res.json({ success: true });
    } catch (err) {
      logger.error({ err }, "admin report resolve");
      res.status(500).json({ success: false, message: "Resolve failed" });
    }
  });

  router.get("/moderation/events", requireAdmin, requirePermission("moderation.read"), async (req, res) => {
    const limit = Math.min(200, Math.max(1, Number(req.query["limit"]) || 60));
    const userId = Number(req.query["userId"]) || null;
    try {
      const params: unknown[] = [limit];
      let filter = "";
      if (userId) {
        filter = "WHERE me.user_id = $2";
        params.push(userId);
      }
      const r = await query(
        `SELECT me.*, u.phone, u.name
         FROM moderation_events me
         JOIN users u ON u.id = me.user_id
         ${filter}
         ORDER BY me.created_at DESC
         LIMIT $1`,
        params,
      );
      res.json({ success: true, events: r.rows });
    } catch (err) {
      logger.error({ err }, "admin moderation events");
      res.status(500).json({ success: false, message: "Could not load moderation events" });
    }
  });

  router.get("/users/:userId/360", requireAdmin, requirePermission("users.read"), async (req, res) => {
    const userId = Number(req.params.userId);
    if (!userId) {
      res.status(400).json({ success: false, message: "Invalid userId" });
      return;
    }
    try {
      const u = await query(
        `SELECT id, phone, name, about, is_online, last_seen, created_at,
                (push_token IS NOT NULL AND push_token <> '') AS has_push
         FROM users WHERE id = $1`,
        [userId],
      );
      if (!u.rows[0]) {
        res.status(404).json({ success: false, message: "User not found" });
        return;
      }

      const risk = await getUserRiskScore(userId);
      const mod = await query(`SELECT * FROM user_moderation_state WHERE user_id = $1`, [userId]);
      const reportsIn = await query(
        `SELECT COUNT(*)::int AS c FROM user_reports WHERE reported_user_id = $1 AND COALESCE(status,'open') = 'open'`,
        [userId],
      );
      const openReports = Number((reportsIn.rows[0] as { c: number })?.c ?? 0);
      const suggestion = suggestModerationAction(risk.score, risk.signals.strikeCount, openReports);

      const recentMsgs = await query(
        `SELECT m.id, m.chat_id, m.content, m.type, m.created_at, c.is_group, c.group_name
         FROM messages m
         JOIN chats c ON c.id = m.chat_id
         WHERE m.sender_id = $1
         ORDER BY m.created_at DESC
         LIMIT 25`,
        [userId],
      );

      const recentReports = await query(
        `SELECT ur.id, ur.reason, ur.status, ur.created_at, rp.name AS reporter_name
         FROM user_reports ur
         LEFT JOIN users rp ON rp.id = ur.reporter_id
         WHERE ur.reported_user_id = $1
         ORDER BY ur.created_at DESC
         LIMIT 15`,
        [userId],
      );

      res.json({
        success: true,
        user: u.rows[0],
        moderation: mod.rows[0] ?? null,
        risk,
        suggestedAction: suggestion,
        openReports,
        recentMessages: recentMsgs.rows,
        recentReports: recentReports.rows,
      });
    } catch (err) {
      logger.error({ err }, "admin user 360");
      res.status(500).json({ success: false, message: "User 360 failed" });
    }
  });

  router.post("/users/:userId/moderate", requireAdmin, requirePermission("users.moderate"), async (req, res) => {
    const userId = Number(req.params.userId);
    const body = req.body as { action?: string; reason?: string };
    const action = body.action as "warn" | "suspend_24h" | "suspend_7d" | "permanent_ban" | undefined;
    const reason = String(body.reason ?? "").trim();
    const allowed = new Set(["warn", "suspend_24h", "suspend_7d", "permanent_ban"]);
    if (!userId || !action || !allowed.has(action) || reason.length < 5) {
      res.status(400).json({
        success: false,
        message: "Valid userId, action (warn|suspend_24h|suspend_7d|permanent_ban), and reason (min 5 chars) required.",
      });
      return;
    }
    try {
      const exists = await query("SELECT id FROM users WHERE id = $1", [userId]);
      if (!exists.rows[0]) {
        res.status(404).json({ success: false, message: "User not found" });
        return;
      }
      await applyAdminSuspension(userId, action, reason, req);
      res.json({ success: true, message: `Applied ${action}` });
    } catch (err) {
      logger.error({ err }, "admin moderate user");
      res.status(500).json({ success: false, message: "Moderation action failed" });
    }
  });

  router.get("/grievances", requireAdmin, requirePermission("grievances.read"), async (req, res) => {
    const status = String(req.query["status"] ?? "open");
    try {
      await ensureAdminPlatformTables();
      const params: unknown[] = [];
      let where = "1=1";
      if (status !== "all") {
        where = "status = $1";
        params.push(status);
      }
      const r = await query(
        `SELECT *, (sla_ack_due_at < NOW() AND first_response_at IS NULL) AS ack_overdue,
                (sla_resolve_due_at < NOW() AND resolved_at IS NULL) AS resolve_overdue
         FROM grievance_tickets
         WHERE ${where}
         ORDER BY ack_overdue DESC, priority DESC, created_at DESC
         LIMIT 100`,
        params,
      );
      res.json({ success: true, grievances: r.rows });
    } catch (err) {
      logger.error({ err }, "admin grievances");
      res.status(500).json({ success: false, message: "Could not load grievances" });
    }
  });

  router.post("/grievances", requireAdmin, requirePermission("grievances.manage"), async (req, res) => {
    const body = req.body as {
      complainantName?: string;
      email?: string;
      phone?: string;
      category?: string;
      description?: string;
      priority?: string;
      linkedUserId?: number;
    };
    const name = String(body.complainantName ?? "").trim();
    const description = String(body.description ?? "").trim();
    if (name.length < 2 || description.length < 10) {
      res.status(400).json({ success: false, message: "Name and description (min 10 chars) required" });
      return;
    }
    const sla = grievanceSlaTimestamps();
    try {
      await ensureAdminPlatformTables();
      const r = await query(
        `INSERT INTO grievance_tickets
         (ticket_number, complainant_name, email, phone, category, description, priority,
          sla_ack_due_at, sla_resolve_due_at, linked_user_id, assigned_admin)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          grievanceTicketNumber(),
          name,
          body.email?.trim() || null,
          body.phone?.trim() || null,
          body.category?.trim() || "general",
          description,
          body.priority?.trim() || "normal",
          sla.ackDue.toISOString(),
          sla.resolveDue.toISOString(),
          body.linkedUserId ?? null,
          adminEmail(req),
        ],
      );
      await logAdminAction(
        { action: "grievance_create", entityType: "grievance", entityId: r.rows[0]?.id },
        req,
      );
      res.json({ success: true, grievance: r.rows[0] });
    } catch (err) {
      logger.error({ err }, "admin create grievance");
      res.status(500).json({ success: false, message: "Could not create grievance" });
    }
  });

  router.patch("/grievances/:id", requireAdmin, requirePermission("grievances.manage"), async (req, res) => {
    const id = Number(req.params.id);
    const body = req.body as { status?: string; resolutionNote?: string; firstResponse?: boolean };
    if (!id) {
      res.status(400).json({ success: false, message: "Invalid id" });
      return;
    }
    try {
      await ensureAdminPlatformTables();
      const updates: string[] = ["updated_at = NOW()"];
      const params: unknown[] = [];
      let i = 1;

      if (body.status) {
        updates.push(`status = $${i++}`);
        params.push(body.status);
        if (body.status === "resolved") {
          updates.push(`resolved_at = NOW()`);
        }
      }
      if (body.resolutionNote) {
        updates.push(`resolution_note = $${i++}`);
        params.push(body.resolutionNote);
      }
      if (body.firstResponse) {
        updates.push(`first_response_at = COALESCE(first_response_at, NOW())`);
      }

      params.push(id);
      const r = await query(
        `UPDATE grievance_tickets SET ${updates.join(", ")} WHERE id = $${i} RETURNING *`,
        params,
      );
      if (!r.rows[0]) {
        res.status(404).json({ success: false, message: "Not found" });
        return;
      }
      await logAdminAction({ action: "grievance_update", entityType: "grievance", entityId: id, metadata: body }, req);
      res.json({ success: true, grievance: r.rows[0] });
    } catch (err) {
      logger.error({ err }, "admin patch grievance");
      res.status(500).json({ success: false, message: "Update failed" });
    }
  });

  router.get("/legal-requests", requireAdmin, requirePermission("legal.read"), async (_req, res) => {
    try {
      await ensureAdminPlatformTables();
      const r = await query(`SELECT * FROM legal_requests ORDER BY created_at DESC LIMIT 100`, []);
      res.json({ success: true, requests: r.rows });
    } catch (err) {
      logger.error({ err }, "admin legal");
      res.status(500).json({ success: false, message: "Could not load legal requests" });
    }
  });

  router.post("/legal-requests", requireAdmin, requirePermission("legal.manage"), async (req, res) => {
    const body = req.body as {
      agencyName?: string;
      officerName?: string;
      officerEmail?: string;
      requestType?: string;
      userIdentifiers?: string[];
      scope?: string;
      dueAt?: string;
      notes?: string;
    };
    const agency = String(body.agencyName ?? "").trim();
    if (agency.length < 2) {
      res.status(400).json({ success: false, message: "agencyName required" });
      return;
    }
    try {
      await ensureAdminPlatformTables();
      const r = await query(
        `INSERT INTO legal_requests
         (reference_number, agency_name, officer_name, officer_email, request_type,
          user_identifiers, scope, due_at, notes)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::timestamptz, $9)
         RETURNING *`,
        [
          legalReferenceNumber(),
          agency,
          body.officerName?.trim() || null,
          body.officerEmail?.trim() || null,
          body.requestType?.trim() || "data_preservation",
          JSON.stringify(body.userIdentifiers ?? []),
          body.scope?.trim() || null,
          body.dueAt ?? null,
          body.notes?.trim() || null,
        ],
      );
      await logAdminAction({ action: "legal_request_create", entityType: "legal_request", entityId: r.rows[0]?.id }, req);
      res.json({ success: true, request: r.rows[0] });
    } catch (err) {
      logger.error({ err }, "admin create legal");
      res.status(500).json({ success: false, message: "Could not create legal request" });
    }
  });

  router.patch("/legal-requests/:id", requireAdmin, requirePermission("legal.manage"), async (req, res) => {
    const id = Number(req.params.id);
    const body = req.body as { status?: string; notes?: string };
    if (!id || !body.status) {
      res.status(400).json({ success: false, message: "id and status required" });
      return;
    }
    try {
      await ensureAdminPlatformTables();
      const fulfilled = body.status === "fulfilled";
      const r = await query(
        `UPDATE legal_requests
         SET status = $2, notes = COALESCE($3, notes), fulfilled_at = CASE WHEN $4 THEN NOW() ELSE fulfilled_at END
         WHERE id = $1 RETURNING *`,
        [id, body.status, body.notes ?? null, fulfilled],
      );
      await logAdminAction({ action: "legal_request_update", entityType: "legal_request", entityId: id }, req);
      res.json({ success: true, request: r.rows[0] });
    } catch (err) {
      logger.error({ err }, "admin patch legal");
      res.status(500).json({ success: false, message: "Update failed" });
    }
  });

  router.get("/data-requests", requireAdmin, requirePermission("dsr.read"), async (_req, res) => {
    try {
      await ensureAdminPlatformTables();
      const r = await query(
        `SELECT dsr.*, u.phone, u.name
         FROM data_subject_requests dsr
         LEFT JOIN users u ON u.id = dsr.user_id
         ORDER BY dsr.created_at DESC
         LIMIT 100`,
        [],
      );
      res.json({ success: true, requests: r.rows });
    } catch (err) {
      logger.error({ err }, "admin dsr");
      res.status(500).json({ success: false, message: "Could not load data requests" });
    }
  });

  router.post("/data-requests", requireAdmin, requirePermission("dsr.manage"), async (req, res) => {
    const body = req.body as { userId?: number; subjectPhone?: string; requestType?: string; adminNotes?: string };
    const type = String(body.requestType ?? "").trim();
    if (!["export", "delete", "correction"].includes(type)) {
      res.status(400).json({ success: false, message: "requestType must be export, delete, or correction" });
      return;
    }
    try {
      await ensureAdminPlatformTables();
      const r = await query(
        `INSERT INTO data_subject_requests (user_id, subject_phone, request_type, admin_notes, status)
         VALUES ($1, $2, $3, $4, 'pending_verification')
         RETURNING *`,
        [body.userId ?? null, body.subjectPhone?.trim() || null, type, body.adminNotes?.trim() || null],
      );
      await logAdminAction({ action: "dsr_create", entityType: "data_subject_request", entityId: r.rows[0]?.id }, req);
      res.json({ success: true, request: r.rows[0] });
    } catch (err) {
      logger.error({ err }, "admin create dsr");
      res.status(500).json({ success: false, message: "Could not create data request" });
    }
  });

  router.patch("/data-requests/:id", requireAdmin, requirePermission("dsr.manage"), async (req, res) => {
    const id = Number(req.params.id);
    const body = req.body as { status?: string; adminNotes?: string };
    if (!id || !body.status) {
      res.status(400).json({ success: false, message: "id and status required" });
      return;
    }
    try {
      await ensureAdminPlatformTables();
      const verified = body.status === "in_progress";
      const completed = body.status === "completed";
      const r = await query(
        `UPDATE data_subject_requests
         SET status = $2,
             admin_notes = COALESCE($3, admin_notes),
             verified_at = CASE WHEN $4 THEN COALESCE(verified_at, NOW()) ELSE verified_at END,
             completed_at = CASE WHEN $5 THEN NOW() ELSE completed_at END
         WHERE id = $1 RETURNING *`,
        [id, body.status, body.adminNotes ?? null, verified, completed],
      );
      await logAdminAction({ action: "dsr_update", entityType: "data_subject_request", entityId: id }, req);
      res.json({ success: true, request: r.rows[0] });
    } catch (err) {
      logger.error({ err }, "admin patch dsr");
      res.status(500).json({ success: false, message: "Update failed" });
    }
  });

  router.get("/analytics/timeseries", requireAdmin, requirePermission("analytics.read"), async (req, res) => {
    const days = Math.min(90, Math.max(7, Number(req.query["days"]) || 30));
    try {
      const users = await query(
        `SELECT date_trunc('day', created_at)::date AS day, COUNT(*)::int AS count
         FROM users WHERE created_at > NOW() - ($1::int || ' days')::interval
         GROUP BY 1 ORDER BY 1`,
        [days],
      );
      const messages = await query(
        `SELECT date_trunc('day', created_at)::date AS day, COUNT(*)::int AS count
         FROM messages WHERE created_at > NOW() - ($1::int || ' days')::interval
         GROUP BY 1 ORDER BY 1`,
        [days],
      );
      const reports = await query(
        `SELECT date_trunc('day', created_at)::date AS day, COUNT(*)::int AS count
         FROM user_reports WHERE created_at > NOW() - ($1::int || ' days')::interval
         GROUP BY 1 ORDER BY 1`,
        [days],
      );
      const suspensions = await query(
        `SELECT date_trunc('day', created_at)::date AS day, COUNT(*)::int AS count
         FROM moderation_events
         WHERE action_taken LIKE '%suspension%' OR action_taken LIKE '%ban%'
           AND created_at > NOW() - ($1::int || ' days')::interval
         GROUP BY 1 ORDER BY 1`,
        [days],
      );
      res.json({
        success: true,
        days,
        series: {
          signups: users.rows,
          messages: messages.rows,
          reports: reports.rows,
          suspensions: suspensions.rows,
        },
      });
    } catch (err) {
      logger.error({ err }, "admin analytics");
      res.status(500).json({ success: false, message: "Analytics failed" });
    }
  });

  router.get("/audit-log", requireAdmin, requirePermission("audit.read"), async (req, res) => {
    const limit = Math.min(300, Math.max(1, Number(req.query["limit"]) || 80));
    try {
      await ensureAdminPlatformTables();
      const r = await query(`SELECT * FROM admin_audit_log ORDER BY created_at DESC LIMIT $1`, [limit]);
      res.json({ success: true, audit: r.rows });
    } catch (err) {
      logger.error({ err }, "admin audit");
      res.status(500).json({ success: false, message: "Audit log failed" });
    }
  });

  router.get("/incidents", requireAdmin, requirePermission("incidents.read"), async (_req, res) => {
    try {
      await ensureAdminPlatformTables();
      const r = await query(`SELECT * FROM platform_incidents ORDER BY created_at DESC LIMIT 50`, []);
      res.json({ success: true, incidents: r.rows });
    } catch (err) {
      logger.error({ err }, "admin incidents");
      res.status(500).json({ success: false, message: "Incidents failed" });
    }
  });

  router.post("/incidents", requireAdmin, requirePermission("incidents.manage"), async (req, res) => {
    const body = req.body as { title?: string; severity?: string; notes?: string; featureFlags?: Record<string, boolean> };
    const title = String(body.title ?? "").trim();
    if (title.length < 3) {
      res.status(400).json({ success: false, message: "title required" });
      return;
    }
    try {
      await ensureAdminPlatformTables();
      const r = await query(
        `INSERT INTO platform_incidents (title, severity, notes, feature_flags)
         VALUES ($1, $2, $3, $4::jsonb) RETURNING *`,
        [title, body.severity?.trim() || "medium", body.notes?.trim() || null, JSON.stringify(body.featureFlags ?? {})],
      );
      await logAdminAction({ action: "incident_create", entityType: "incident", entityId: r.rows[0]?.id }, req);
      res.json({ success: true, incident: r.rows[0] });
    } catch (err) {
      logger.error({ err }, "admin create incident");
      res.status(500).json({ success: false, message: "Could not create incident" });
    }
  });

  router.patch("/incidents/:id", requireAdmin, requirePermission("incidents.manage"), async (req, res) => {
    const id = Number(req.params.id);
    const body = req.body as { status?: string; notes?: string };
    if (!id) {
      res.status(400).json({ success: false, message: "Invalid id" });
      return;
    }
    try {
      await ensureAdminPlatformTables();
      const resolved = body.status === "resolved";
      const r = await query(
        `UPDATE platform_incidents
         SET status = COALESCE($2, status), notes = COALESCE($3, notes),
             resolved_at = CASE WHEN $4 THEN NOW() ELSE resolved_at END
         WHERE id = $1 RETURNING *`,
        [id, body.status ?? null, body.notes ?? null, resolved],
      );
      await logAdminAction({ action: "incident_update", entityType: "incident", entityId: id }, req);
      res.json({ success: true, incident: r.rows[0] });
    } catch (err) {
      logger.error({ err }, "admin patch incident");
      res.status(500).json({ success: false, message: "Update failed" });
    }
  });

  router.get("/developer-leads", requireAdmin, requirePermission("developer.read"), async (req, res) => {
    const status = String(req.query["status"] ?? "pending");
    try {
      await ensureDeveloperLeadsTable();
      const params: unknown[] = [];
      let where = "1=1";
      if (status === "pending") {
        where = "status NOT IN ('approved', 'rejected', 'suspended')";
      } else if (status !== "all") {
        where = "status = $1";
        params.push(status);
      }
      await ensureDeveloperTemplateTables();
      const r = await query(
        `SELECT l.*,
          (SELECT COUNT(*)::int FROM developer_message_templates t
           WHERE t.lead_id = l.id AND t.status = 'pending') AS pending_template_count
         FROM developer_leads l
         WHERE ${where.replace(/\bstatus\b/g, "l.status")}
         ORDER BY
           CASE WHEN l.status = 'paid' THEN 0 WHEN l.status = 'payment_pending' THEN 1 ELSE 2 END,
           l.created_at DESC
         LIMIT 200`,
        params,
      );
      res.json({ success: true, leads: r.rows, statuses: DEVELOPER_STATUSES });
    } catch (err) {
      logger.error({ err }, "admin developer-leads list");
      res.status(500).json({ success: false, message: "Could not load developer applications" });
    }
  });

  router.get("/developer-leads/:id", requireAdmin, requirePermission("developer.read"), async (req, res) => {
    const id = Number(req.params.id);
    if (!id) {
      res.status(400).json({ success: false, message: "Invalid id" });
      return;
    }
    try {
      await ensureDeveloperLeadsTable();
      const lead = await query(`SELECT * FROM developer_leads WHERE id = $1`, [id]);
      if (!lead.rows[0]) {
        res.status(404).json({ success: false, message: "Not found" });
        return;
      }
      const docs = await query(`SELECT * FROM developer_lead_documents WHERE lead_id = $1 ORDER BY doc_type`, [id]);
      const account = await query(`SELECT * FROM developer_api_accounts WHERE lead_id = $1`, [id]);
      await ensureDeveloperTemplateTables();
      const templates = await query(
        `SELECT * FROM developer_message_templates WHERE lead_id = $1 ORDER BY template_key`,
        [id],
      );
      res.json({
        success: true,
        lead: lead.rows[0],
        documents: docs.rows,
        requiredDocuments: documentsForEntity(String(lead.rows[0].entity_type)),
        account: account.rows[0] ?? null,
        templates: templates.rows,
      });
    } catch (err) {
      logger.error({ err }, "admin developer-lead detail");
      res.status(500).json({ success: false, message: "Could not load application" });
    }
  });

  router.patch("/developer-leads/:id", requireAdmin, requirePermission("developer.manage"), async (req, res) => {
    const id = Number(req.params.id);
    const body = req.body as { status?: string; adminNotes?: string; approvalPhase?: string };
    if (!id) {
      res.status(400).json({ success: false, message: "Invalid id" });
      return;
    }
    if (body.status && !(DEVELOPER_STATUSES as readonly string[]).includes(body.status)) {
      res.status(400).json({ success: false, message: "Invalid status" });
      return;
    }
    try {
      await ensureDeveloperLeadsTable();
      const updates: string[] = ["reviewed_at = NOW()", `assigned_admin = $1`, "updated_at = NOW()"];
      const params: unknown[] = [adminEmail(req)];
      let i = 2;
      if (body.status) {
        updates.push(`status = $${i++}`);
        params.push(body.status);
      }
      if (body.approvalPhase) {
        updates.push(`approval_phase = $${i++}`);
        params.push(body.approvalPhase);
      }
      if (body.adminNotes !== undefined) {
        updates.push(`admin_notes = $${i++}`);
        params.push(body.adminNotes);
      }
      params.push(id);
      const r = await query(
        `UPDATE developer_leads SET ${updates.join(", ")} WHERE id = $${i} RETURNING *`,
        params,
      );
      if (!r.rows[0]) {
        res.status(404).json({ success: false, message: "Application not found" });
        return;
      }

      if (body.status === "suspended") {
        await query(`UPDATE developer_api_accounts SET billing_status = 'suspended' WHERE lead_id = $1`, [id]);
        await query(
          `UPDATE developer_leads SET channel_status = 'suspended', updated_at = NOW() WHERE id = $1`,
          [id],
        );
      }

      let apiSecretOnce: string | null = null;
      if (body.status === "approved") {
        const row = r.rows[0] as Record<string, unknown>;
        const existing = await query(`SELECT id FROM developer_api_accounts WHERE lead_id = $1`, [id]);
        if (existing.rows[0]) {
          await query(
            `UPDATE developer_api_accounts SET billing_status = 'active' WHERE lead_id = $1 AND billing_status = 'suspended'`,
            [id],
          );
          await query(
            `UPDATE developer_leads SET channel_status = CASE
               WHEN videh_phone_number_id IS NOT NULL THEN 'verified'
               ELSE channel_status
             END,
             updated_at = NOW()
             WHERE id = $1 AND channel_status = 'suspended'`,
            [id],
          );
          const acct = existing.rows[0] as { id: number };
          await linkTemplatesToAccount(id, acct.id);
          await copyChannelToAccount(id, acct.id);
        } else {
          const paymentOk =
            row.payment_method_verified === true ||
            row.payment_status === "method_verified" ||
            row.payment_status === "paid" ||
            row.payment_status === "waived";
          if (!paymentOk) {
            res.status(400).json({
              success: false,
              message: "Cannot approve: payment method not verified. Applicant must complete Razorpay verification.",
            });
            return;
          }
          if (row.channel_status !== "verified" || !row.videh_phone_number_id) {
            res.status(400).json({
              success: false,
              message: "Cannot approve: business channel phone not verified. Applicant must complete dedicated number OTP.",
            });
            return;
          }
          const apiKeyId = `vsk_${crypto.randomBytes(8).toString("hex")}`;
          const apiSecret = `vsec_${crypto.randomBytes(24).toString("hex")}`;
          const secretHash = hashApiSecret(apiSecret);
          let secretEnc: string | null = null;
          try {
            secretEnc = encryptApiSecret(apiSecret);
          } catch {
            secretEnc = null;
          }
          const billingStatus = paymentOk ? "active" : "hold";
          const ins = await query(
            `INSERT INTO developer_api_accounts
             (lead_id, reference_code, company_name, display_name, logo_url, api_key_id, api_key_secret_hash, api_key_secret_enc,
              billing_status, plan_id, amount_inr_monthly, total_billed_inr, last_payment_at, next_billing_at, approved_by,
              channel_phone, channel_status, channel_verified_at, videh_phone_number_id, videh_business_account_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, NOW() + INTERVAL '30 days', $13,
              $14,$15,$16,$17,$18)
             RETURNING id`,
            [
              id,
              row.reference_code,
              row.company_name,
              row.display_name ?? row.company_name,
              row.logo_url,
              apiKeyId,
              secretHash,
              secretEnc,
              billingStatus,
              row.plan_id,
              row.amount_inr,
              row.payment_status === "paid" ? row.amount_inr : 0,
              row.paid_at ?? null,
              adminEmail(req),
              row.channel_phone,
              row.channel_status,
              row.channel_verified_at,
              row.videh_phone_number_id,
              row.videh_business_account_id,
            ],
          );
          const newAccountId = Number((ins.rows[0] as { id: number }).id);
          await linkTemplatesToAccount(id, newAccountId);
          await copyChannelToAccount(id, newAccountId);
          apiSecretOnce = apiSecret;
        }
      }

      await logAdminAction(
        {
          action: "developer_lead_update",
          entityType: "developer_lead",
          entityId: id,
          metadata: { status: body.status, approvalPhase: body.approvalPhase },
        },
        req,
      );
      res.json({ success: true, lead: r.rows[0], apiSecretOnce });
    } catch (err) {
      logger.error({ err }, "admin developer-lead patch");
      res.status(500).json({ success: false, message: "Update failed" });
    }
  });

  router.delete("/developer-leads/:id", requireAdmin, requirePermission("developer.manage"), async (req, res) => {
    const id = Number(req.params.id);
    if (!id) {
      res.status(400).json({ success: false, message: "Invalid id" });
      return;
    }
    try {
      await ensureDeveloperLeadsTable();
      const ok = await deleteDeveloperLeadById(id);
      if (!ok) {
        res.status(404).json({ success: false, message: "Application not found" });
        return;
      }
      await logAdminAction(
        { action: "developer_lead_delete", entityType: "developer_lead", entityId: id },
        req,
      );
      res.json({ success: true, deleted: true });
    } catch (err) {
      logger.error({ err }, "admin developer-lead delete");
      res.status(500).json({ success: false, message: "Delete failed" });
    }
  });

  router.get("/developer-accounts", requireAdmin, requirePermission("developer.read"), async (_req, res) => {
    try {
      await ensureDeveloperLeadsTable();
      const r = await query(
        `SELECT a.*, l.email, l.phone, l.entity_type, l.gstin, l.payment_status, l.status AS lead_status
         FROM developer_api_accounts a
         JOIN developer_leads l ON l.id = a.lead_id
         ORDER BY a.created_at DESC
         LIMIT 500`,
      );
      res.json({ success: true, accounts: r.rows });
    } catch (err) {
      logger.error({ err }, "admin developer-accounts");
      res.status(500).json({ success: false, message: "Could not load API accounts" });
    }
  });

  router.patch("/developer-accounts/:id", requireAdmin, requirePermission("developer.manage"), async (req, res) => {
    const id = Number(req.params.id);
    const body = req.body as { billingStatus?: string; adminNotes?: string };
    if (!id) {
      res.status(400).json({ success: false, message: "Invalid id" });
      return;
    }
    const allowed = new Set(["active", "hold", "past_due", "suspended"]);
    if (body.billingStatus && !allowed.has(body.billingStatus)) {
      res.status(400).json({ success: false, message: "Invalid billing status" });
      return;
    }
    try {
      const updates: string[] = [];
      const params: unknown[] = [];
      let i = 1;
      if (body.billingStatus) {
        updates.push(`billing_status = $${i++}`);
        params.push(body.billingStatus);
        if (body.billingStatus === "hold") {
          updates.push(`last_payment_failed_at = NOW()`);
        }
        if (body.billingStatus === "active") {
          updates.push(`last_payment_at = NOW()`);
        }
      }
      if (updates.length === 0) {
        res.status(400).json({ success: false, message: "Nothing to update" });
        return;
      }
      params.push(id);
      const r = await query(
        `UPDATE developer_api_accounts SET ${updates.join(", ")} WHERE id = $${i} RETURNING *`,
        params,
      );
      if (!r.rows[0]) {
        res.status(404).json({ success: false, message: "Account not found" });
        return;
      }
      if (body.adminNotes) {
        await query(`UPDATE developer_leads SET admin_notes = $1 WHERE id = $2`, [
          body.adminNotes,
          (r.rows[0] as { lead_id: number }).lead_id,
        ]);
      }
      await logAdminAction(
        { action: "developer_account_update", entityType: "developer_api_account", entityId: id },
        req,
      );
      res.json({ success: true, account: r.rows[0] });
    } catch (err) {
      logger.error({ err }, "admin developer-account patch");
      res.status(500).json({ success: false, message: "Update failed" });
    }
  });

  router.get(
    "/developer-leads/:leadId/templates",
    requireAdmin,
    requirePermission("developer.read"),
    async (req, res) => {
      const leadId = Number(req.params.leadId);
      if (!leadId) {
        res.status(400).json({ success: false, message: "Invalid lead id" });
        return;
      }
      try {
        await ensureDeveloperTemplateTables();
        const r = await query(
          `SELECT * FROM developer_message_templates WHERE lead_id = $1 ORDER BY template_key`,
          [leadId],
        );
        res.json({ success: true, templates: r.rows });
      } catch (err) {
        logger.error({ err }, "admin list templates");
        res.status(500).json({ success: false, message: "Could not load templates" });
      }
    },
  );

  router.post(
    "/developer-leads/:leadId/templates",
    requireAdmin,
    requirePermission("developer.manage"),
    async (req, res) => {
      const leadId = Number(req.params.leadId);
      const body = req.body as {
        templateKey?: string;
        name?: string;
        category?: string;
        language?: string;
        headerType?: string;
        headerText?: string;
        headerMediaUrl?: string;
        bodyText?: string;
        variables?: string[];
        footerText?: string;
        buttons?: unknown;
        variableSamples?: Record<string, string>;
      };
      if (!leadId || !body.templateKey?.trim() || !body.bodyText?.trim()) {
        res.status(400).json({ success: false, message: "templateKey and bodyText required" });
        return;
      }
      const category = body.category ?? "utility";
      const allowed = new Set(["marketing", "utility", "authentication", "service"]);
      if (!allowed.has(category)) {
        res.status(400).json({ success: false, message: "Invalid category" });
        return;
      }
      try {
        await ensureDeveloperTemplateTables();
        const lead = await query(`SELECT id FROM developer_leads WHERE id = $1`, [leadId]);
        if (!lead.rows[0]) {
          res.status(404).json({ success: false, message: "Lead not found" });
          return;
        }
        const account = await query(`SELECT id FROM developer_api_accounts WHERE lead_id = $1`, [leadId]);
        const accountId = (account.rows[0] as { id?: number } | undefined)?.id ?? null;
        const built = buildTemplateInsertParams(leadId, accountId, {
          templateKey: body.templateKey,
          name: body.name,
          category,
          language: body.language,
          headerFormat: body.headerType,
          headerText: body.headerText,
          headerMediaUrl: body.headerMediaUrl,
          bodyText: body.bodyText,
          footerText: body.footerText,
          buttons: body.buttons,
          variables: body.variables,
          variableSamples: body.variableSamples,
        });
        const r = await query(
          `INSERT INTO developer_message_templates
           (lead_id, account_id, template_key, name, category, language, header_type, header_text, header_media_url,
            body_text, body_preview, variables_json, variable_samples_json, footer_text, buttons_json, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'pending')
           ON CONFLICT (lead_id, template_key) DO UPDATE SET
             name = EXCLUDED.name,
             category = EXCLUDED.category,
             language = EXCLUDED.language,
             header_type = EXCLUDED.header_type,
             header_text = EXCLUDED.header_text,
             header_media_url = EXCLUDED.header_media_url,
             body_text = EXCLUDED.body_text,
             body_preview = EXCLUDED.body_preview,
             variables_json = EXCLUDED.variables_json,
             variable_samples_json = EXCLUDED.variable_samples_json,
             footer_text = EXCLUDED.footer_text,
             buttons_json = EXCLUDED.buttons_json,
             account_id = COALESCE(EXCLUDED.account_id, developer_message_templates.account_id),
             updated_at = NOW()
           RETURNING *`,
          [...built.values],
        );
        await logAdminAction(
          { action: "developer_template_create", entityType: "developer_template", entityId: (r.rows[0] as { id: number }).id },
          req,
        );
        res.json({ success: true, template: r.rows[0] });
      } catch (err) {
        logger.error({ err }, "admin create template");
        res.status(500).json({ success: false, message: "Could not save template" });
      }
    },
  );

  router.get(
    "/developer-templates/pending",
    requireAdmin,
    requirePermission("developer.read"),
    async (_req, res) => {
      try {
        await ensureDeveloperTemplateTables();
        const r = await query(
          `SELECT t.id, t.lead_id, t.template_key, t.name, t.category, t.language,
                  t.body_text, t.body_preview, t.variables_json, t.status, t.rejection_reason,
                  t.submitted_at, t.created_at,
                  l.reference_code, l.company_name, l.display_name, l.status AS lead_status, l.email AS lead_email
           FROM developer_message_templates t
           INNER JOIN developer_leads l ON l.id = t.lead_id
           WHERE t.status = 'pending'
           ORDER BY t.submitted_at ASC NULLS LAST, t.created_at ASC
           LIMIT 200`,
        );
        res.json({ success: true, templates: r.rows, count: r.rows.length });
      } catch (err) {
        logger.error({ err }, "admin pending developer templates");
        res.status(500).json({ success: false, message: "Could not load pending templates" });
      }
    },
  );

  router.patch(
    "/developer-templates/:id",
    requireAdmin,
    requirePermission("developer.manage"),
    async (req, res) => {
      const id = Number(req.params.id);
      const body = req.body as { status?: string; rejectionReason?: string; name?: string; category?: string };
      if (!id) {
        res.status(400).json({ success: false, message: "Invalid id" });
        return;
      }
      const allowed = new Set(["pending", "approved", "rejected"]);
      if (body.status && !allowed.has(body.status)) {
        res.status(400).json({ success: false, message: "Invalid status" });
        return;
      }
      try {
        await ensureDeveloperTemplateTables();
        const updates: string[] = ["updated_at = NOW()"];
        const params: unknown[] = [];
        let i = 1;
        if (body.status) {
          updates.push(`status = $${i++}`);
          params.push(body.status);
          if (body.status === "approved") {
            updates.push(`approved_at = NOW()`, `approved_by = $${i++}`);
            params.push(adminEmail(req));
            updates.push(`rejection_reason = NULL`);
          }
          if (body.status === "rejected") {
            updates.push(`rejection_reason = $${i++}`);
            params.push(body.rejectionReason ?? "Rejected by admin");
          }
        }
        if (body.name) {
          updates.push(`name = $${i++}`);
          params.push(body.name);
        }
        if (body.category) {
          updates.push(`category = $${i++}`);
          params.push(body.category);
        }
        if (updates.length === 1) {
          res.status(400).json({ success: false, message: "Nothing to update" });
          return;
        }
        params.push(id);
        const r = await query(
          `UPDATE developer_message_templates SET ${updates.join(", ")} WHERE id = $${i} RETURNING *`,
          params,
        );
        if (!r.rows[0]) {
          res.status(404).json({ success: false, message: "Template not found" });
          return;
        }
        const tpl = r.rows[0] as { lead_id: number; account_id: number | null };
        if (body.status === "approved" && !tpl.account_id) {
          const acct = await query(`SELECT id FROM developer_api_accounts WHERE lead_id = $1`, [tpl.lead_id]);
          const accountId = (acct.rows[0] as { id?: number } | undefined)?.id;
          if (accountId) {
            await query(`UPDATE developer_message_templates SET account_id = $1 WHERE id = $2`, [accountId, id]);
          }
        }
        await logAdminAction(
          { action: "developer_template_update", entityType: "developer_template", entityId: id, metadata: { status: body.status } },
          req,
        );
        res.json({ success: true, template: r.rows[0] });
      } catch (err) {
        logger.error({ err }, "admin patch template");
        res.status(500).json({ success: false, message: "Update failed" });
      }
    },
  );

  router.patch(
    "/developer-leads/:leadId/channel",
    requireAdmin,
    requirePermission("developer.manage"),
    async (req, res) => {
      const leadId = Number(req.params.leadId);
      const body = req.body as { channelPhone?: string; channelStatus?: string; manualVerify?: boolean };
      if (!leadId) {
        res.status(400).json({ success: false, message: "Invalid lead id" });
        return;
      }
      try {
        await ensureDeveloperChannelColumns();
        const lead = await query(`SELECT * FROM developer_leads WHERE id = $1`, [leadId]);
        if (!lead.rows[0]) {
          res.status(404).json({ success: false, message: "Lead not found" });
          return;
        }
        const L = lead.rows[0] as Record<string, unknown>;
        let vba = L.videh_business_account_id as string | null;
        let vpn = L.videh_phone_number_id as string | null;
        if (!vba) vba = generateBusinessAccountId();
        if (body.manualVerify && !vpn) vpn = generatePhoneNumberId();
        const phone = body.channelPhone?.trim() ? body.channelPhone : L.channel_phone;
        const status = body.manualVerify ? "verified" : (body.channelStatus ?? L.channel_status);
        await query(
          `UPDATE developer_leads SET
             channel_phone = COALESCE($1, channel_phone),
             channel_status = $2,
             channel_verified_at = CASE WHEN $2 = 'verified' THEN NOW() ELSE channel_verified_at END,
             videh_business_account_id = COALESCE(videh_business_account_id, $3),
             videh_phone_number_id = COALESCE(videh_phone_number_id, $4),
             updated_at = NOW()
           WHERE id = $5`,
          [phone, status, vba, vpn, leadId],
        );
        const acct = await query(`SELECT id FROM developer_api_accounts WHERE lead_id = $1`, [leadId]);
        if ((acct.rows[0] as { id?: number })?.id) {
          await copyChannelToAccount(leadId, (acct.rows[0] as { id: number }).id);
        }
        const updated = await query(`SELECT * FROM developer_leads WHERE id = $1`, [leadId]);
        res.json({ success: true, lead: updated.rows[0] });
      } catch (err) {
        logger.error({ err }, "admin channel patch");
        res.status(500).json({ success: false, message: "Channel update failed" });
      }
    },
  );

  router.delete(
    "/developer-templates/:id",
    requireAdmin,
    requirePermission("developer.manage"),
    async (req, res) => {
      const id = Number(req.params.id);
      if (!id) {
        res.status(400).json({ success: false, message: "Invalid id" });
        return;
      }
      try {
        await query(`DELETE FROM developer_message_templates WHERE id = $1`, [id]);
        await logAdminAction({ action: "developer_template_delete", entityType: "developer_template", entityId: id }, req);
        res.json({ success: true });
      } catch (err) {
        logger.error({ err }, "admin delete template");
        res.status(500).json({ success: false, message: "Delete failed" });
      }
    },
  );
}

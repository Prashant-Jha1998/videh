import crypto from "node:crypto";
import { Router, type Request, type Response, type NextFunction } from "express";
import { query } from "../lib/db";
import {
  ADMIN_COOKIE,
  ADMIN_PREAUTH_COOKIE,
  issueAdminSessionToken,
  issuePreauthToken,
  verifyAdminSessionToken,
  verifyPreauthToken,
  adminSessionConfigured,
} from "../lib/adminSession";
import { adminTotpConfigured, verifyAdminTotpCode } from "../lib/adminTotp";
import { logger } from "../lib/logger";

const router = Router();
const MAX_ADMIN_GROUP_MEMBERS = 10000;

let statusBoostTablesEnsured = false;
async function ensureStatusBoostTables(): Promise<void> {
  if (statusBoostTablesEnsured) return;
  await query(`
    CREATE TABLE IF NOT EXISTS status_boosts (
      id SERIAL PRIMARY KEY,
      status_id INTEGER NOT NULL REFERENCES statuses(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount_inr INTEGER NOT NULL,
      duration_hours INTEGER NOT NULL,
      duration_days INTEGER NOT NULL DEFAULT 1,
      estimated_reach INTEGER NOT NULL,
      target_state TEXT,
      target_city TEXT,
      target_radius_km INTEGER NOT NULL DEFAULT 10,
      status TEXT NOT NULL DEFAULT 'pending_verification',
      payment_status TEXT NOT NULL DEFAULT 'paid',
      payment_provider TEXT NOT NULL DEFAULT 'manual',
      payment_reference TEXT,
      verification_note TEXT,
      verified_at TIMESTAMPTZ,
      rejected_at TIMESTAMPTZ,
      pending_hold_until TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
      starts_at TIMESTAMPTZ,
      ends_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    ALTER TABLE status_boosts
      ADD COLUMN IF NOT EXISTS target_state TEXT,
      ADD COLUMN IF NOT EXISTS target_city TEXT,
      ADD COLUMN IF NOT EXISTS target_radius_km INTEGER NOT NULL DEFAULT 10,
      ADD COLUMN IF NOT EXISTS duration_days INTEGER NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'paid',
      ADD COLUMN IF NOT EXISTS verification_note TEXT,
      ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS pending_hold_until TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours'
  `);
  await query("ALTER TABLE status_boosts ALTER COLUMN starts_at DROP NOT NULL");
  statusBoostTablesEnsured = true;
}

function normalizeEmail(s: string): string {
  return s.trim().toLowerCase();
}

function timingSafeStringEqual(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "utf8");
    const bb = Buffer.from(b, "utf8");
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

function phoneKey(raw: string): string {
  return String(raw ?? "").replace(/\D/g, "");
}

function splitPhoneList(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x ?? "").trim()).filter(Boolean);
  }
  return String(raw ?? "")
    .split(/[\n,;]+/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

function cookieOpts(maxAge: number) {
  const secure = process.env["NODE_ENV"] === "production";
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    maxAge,
    path: "/",
  };
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!adminSessionConfigured()) {
    res.status(503).json({ success: false, message: "Admin session is not configured (ADMIN_SESSION_SECRET)." });
    return;
  }
  const token = req.cookies?.[ADMIN_COOKIE] as string | undefined;
  if (!verifyAdminSessionToken(token)) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }
  next();
}

router.get("/config", (req, res) => {
  const email = process.env["ADMIN_EMAIL"]?.trim();
  const pre = req.cookies?.[ADMIN_PREAUTH_COOKIE] as string | undefined;
  res.json({
    success: true,
    loginEnabled: Boolean(email && process.env["ADMIN_PASSWORD"]),
    sessionConfigured: adminSessionConfigured(),
    twoFactorConfigured: adminTotpConfigured(),
    preauthPending: verifyPreauthToken(pre),
  });
});

router.post("/login", (req: Request, res: Response) => {
  const emailEnv = process.env["ADMIN_EMAIL"]?.trim();
  const passEnv = process.env["ADMIN_PASSWORD"] ?? "";
  if (!emailEnv || !passEnv) {
    res.status(503).json({
      success: false,
      message: "Admin login is not configured. Set ADMIN_EMAIL and ADMIN_PASSWORD on the server.",
    });
    return;
  }
  if (!adminSessionConfigured()) {
    res.status(503).json({
      success: false,
      message: "Set ADMIN_SESSION_SECRET (min 16 characters) for admin sessions.",
    });
    return;
  }
  if (!adminTotpConfigured()) {
    res.status(503).json({
      success: false,
      message:
        "Two-factor authentication is required. Set ADMIN_TOTP_SECRET to a Base32 secret (e.g. from an authenticator app setup key) on the server.",
    });
    return;
  }

  const email = normalizeEmail(String((req.body as { email?: string })?.email ?? ""));
  const password = String((req.body as { password?: string })?.password ?? "");

  if (!timingSafeStringEqual(email, normalizeEmail(emailEnv)) || !timingSafeStringEqual(password, passEnv)) {
    res.status(401).json({ success: false, message: "Invalid email or password" });
    return;
  }

  const pre = issuePreauthToken();
  if (!pre) {
    res.status(500).json({ success: false, message: "Could not create pre-auth state" });
    return;
  }

  res.cookie(ADMIN_PREAUTH_COOKIE, pre, cookieOpts(5 * 60 * 1000));
  res.json({ success: true, needTwoFactor: true });
});

router.post("/login/totp", (req: Request, res: Response) => {
  if (!adminSessionConfigured() || !adminTotpConfigured()) {
    res.status(503).json({ success: false, message: "Admin or 2FA is not configured." });
    return;
  }

  const pre = req.cookies?.[ADMIN_PREAUTH_COOKIE] as string | undefined;
  if (!verifyPreauthToken(pre)) {
    res.status(401).json({
      success: false,
      message: "Sign in with email and password first, or the step expired. Try again.",
    });
    return;
  }

  const code = String((req.body as { code?: string })?.code ?? "").trim();
  if (!verifyAdminTotpCode(code)) {
    res.status(401).json({ success: false, message: "Invalid authenticator code" });
    return;
  }

  const token = issueAdminSessionToken();
  if (!token) {
    res.status(500).json({ success: false, message: "Could not create session" });
    return;
  }

  res.clearCookie(ADMIN_PREAUTH_COOKIE, { path: "/" });
  res.cookie(ADMIN_COOKIE, token, cookieOpts(12 * 60 * 60 * 1000));
  res.json({ success: true });
});

router.post("/login/cancel", (_req: Request, res: Response) => {
  res.clearCookie(ADMIN_PREAUTH_COOKIE, { path: "/" });
  res.json({ success: true });
});

router.post("/logout", (_req: Request, res: Response) => {
  res.clearCookie(ADMIN_COOKIE, { path: "/" });
  res.clearCookie(ADMIN_PREAUTH_COOKIE, { path: "/" });
  res.json({ success: true });
});

router.get("/me", requireAdmin, (_req, res) => {
  res.json({ success: true, admin: true });
});

router.get("/stats", requireAdmin, async (_req, res) => {
  try {
    await ensureStatusBoostTables();
    const r = await query(
      `SELECT
        (SELECT COUNT(*)::int FROM users) AS users,
        (SELECT COUNT(*)::int FROM chats) AS chats,
        (SELECT COUNT(*)::int FROM messages WHERE created_at > NOW() - INTERVAL '24 hours') AS messages_24h,
        (SELECT COUNT(*)::int FROM messages) AS messages_total,
        (SELECT COUNT(*)::int FROM calls WHERE created_at > NOW() - INTERVAL '7 days') AS calls_7d,
        (SELECT COUNT(*)::int FROM calls) AS calls_total,
        (SELECT COUNT(*)::int FROM sos_contacts) AS sos_contacts,
        (SELECT COUNT(*)::int FROM scheduled_messages WHERE sent = FALSE) AS scheduled_pending,
        (SELECT COUNT(*)::int FROM broadcast_lists) AS broadcast_lists,
        (SELECT COUNT(*)::int FROM statuses WHERE expires_at > NOW()) AS statuses_active,
        (SELECT COUNT(*)::int FROM status_boosts WHERE status = 'active' AND ends_at > NOW()) AS status_boosts_active,
        (SELECT COUNT(*)::int FROM status_boosts WHERE status = 'pending_verification') AS status_boosts_pending,
        (SELECT COALESCE(SUM(amount_inr), 0)::int FROM status_boosts WHERE payment_status IN ('paid', 'captured')) AS status_boost_revenue_inr,
        (SELECT COUNT(*)::int FROM web_sessions WHERE status = 'linked' AND expires_at > NOW()) AS web_sessions_active`,
      [],
    );
    const row = r.rows[0] as Record<string, number>;
    res.json({ success: true, stats: row });
  } catch (err) {
    logger.error({ err }, "admin /stats");
    res.status(500).json({ success: false, message: "Stats query failed" });
  }
});

router.get("/suspensions", requireAdmin, async (_req, res) => {
  try {
    const r = await query(
      `SELECT ms.user_id, u.phone, u.name, ms.strike_count, ms.suspended_until, ms.permanently_suspended,
              ms.last_reason, ms.updated_at
       FROM user_moderation_state ms
       JOIN users u ON u.id = ms.user_id
       WHERE ms.permanently_suspended = TRUE
          OR (ms.suspended_until IS NOT NULL AND ms.suspended_until > NOW())
       ORDER BY ms.permanently_suspended DESC, ms.updated_at DESC
       LIMIT 500`,
      [],
    );
    res.json({ success: true, suspensions: r.rows });
  } catch (err) {
    logger.error({ err }, "admin /suspensions");
    res.status(500).json({ success: false, message: "Could not load suspended accounts." });
  }
});

router.post("/suspensions/:userId/revoke", requireAdmin, async (req, res) => {
  const userId = Number(req.params.userId);
  if (!userId) {
    res.status(400).json({ success: false, message: "Invalid userId." });
    return;
  }
  try {
    await query(
      `UPDATE user_moderation_state
       SET suspended_until = NULL,
           permanently_suspended = FALSE,
           updated_at = NOW()
       WHERE user_id = $1`,
      [userId],
    );
    await query(
      `INSERT INTO moderation_events (user_id, activity_type, reason, excerpt, severity, action_taken)
       VALUES ($1, 'admin_action', 'Admin manually revoked suspension', NULL, 'high', 'admin_revoke')`,
      [userId],
    );
    res.json({ success: true, message: "Suspension revoked." });
  } catch (err) {
    logger.error({ err }, "admin revoke suspension");
    res.status(500).json({ success: false, message: "Could not revoke suspension." });
  }
});

router.get("/status-boosts", requireAdmin, async (req, res) => {
  const status = String(req.query["status"] ?? "pending_verification");
  const safeStatus = ["pending_verification", "active", "rejected"].includes(status) ? status : "pending_verification";
  try {
    await ensureStatusBoostTables();
    const r = await query(
      `SELECT sb.*, s.content, s.type, s.media_url, s.created_at AS story_created_at,
              u.name AS owner_name
       FROM status_boosts sb
       JOIN statuses s ON s.id = sb.status_id
       JOIN users u ON u.id = sb.user_id
       WHERE sb.status = $1
       ORDER BY sb.created_at DESC
       LIMIT 100`,
      [safeStatus],
    );
    res.json({ success: true, boosts: r.rows });
  } catch (err) {
    logger.error({ err }, "admin /status-boosts");
    res.status(500).json({ success: false, message: "Could not load status boosts." });
  }
});

router.post("/status-boosts/:boostId/approve", requireAdmin, async (req, res) => {
  const boostId = Number(req.params["boostId"]);
  const note = String((req.body as { note?: string }).note ?? "").trim() || null;
  if (!boostId) {
    res.status(400).json({ success: false, message: "Invalid boostId." });
    return;
  }
  try {
    await ensureStatusBoostTables();
    const approved = await query(
      `UPDATE status_boosts
       SET status = 'active',
           verification_note = $2,
           verified_at = NOW(),
           starts_at = NOW(),
           ends_at = NOW() + (duration_days::int * INTERVAL '1 day')
       WHERE id = $1
         AND status = 'pending_verification'
         AND payment_status IN ('paid', 'captured')
         AND pending_hold_until > NOW()
       RETURNING *`,
      [boostId, note],
    );
    const row = approved.rows[0];
    if (!row) {
      res.status(404).json({ success: false, message: "Pending captured boost not found or verification window expired." });
      return;
    }
    await query(
      `UPDATE statuses
       SET expires_at = GREATEST(expires_at, $2::timestamptz)
       WHERE id = $1`,
      [row.status_id, row.ends_at],
    );
    res.json({ success: true, boost: row, message: "Boost approved and activated." });
  } catch (err) {
    logger.error({ err }, "admin approve status boost");
    res.status(500).json({ success: false, message: "Could not approve boost." });
  }
});

router.post("/status-boosts/:boostId/reject", requireAdmin, async (req, res) => {
  const boostId = Number(req.params["boostId"]);
  const note = String((req.body as { note?: string }).note ?? "").trim() || null;
  if (!boostId) {
    res.status(400).json({ success: false, message: "Invalid boostId." });
    return;
  }
  try {
    await ensureStatusBoostTables();
    const rejected = await query(
      `UPDATE status_boosts
       SET status = 'rejected',
           verification_note = $2,
           rejected_at = NOW()
       WHERE id = $1
         AND status = 'pending_verification'
       RETURNING *`,
      [boostId, note],
    );
    if (!rejected.rows[0]) {
      res.status(404).json({ success: false, message: "Pending boost not found." });
      return;
    }
    res.json({ success: true, boost: rejected.rows[0], message: "Boost rejected." });
  } catch (err) {
    logger.error({ err }, "admin reject status boost");
    res.status(500).json({ success: false, message: "Could not reject boost." });
  }
});

router.get("/users", requireAdmin, async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query["limit"]) || 50));
  const offset = Math.max(0, Number(req.query["offset"]) || 0);
  const search = String(req.query["search"] ?? "").trim();
  try {
    if (search) {
      const like = `%${search.replace(/%/g, "").replace(/_/g, "")}%`;
      const r = await query(
        `SELECT id, phone, name, is_online, (push_token IS NOT NULL AND push_token <> '') AS has_push,
                created_at, last_seen
         FROM users
         WHERE phone ILIKE $1 OR COALESCE(name, '') ILIKE $1
         ORDER BY id DESC
         LIMIT $2 OFFSET $3`,
        [like, limit, offset],
      );
      res.json({ success: true, users: r.rows });
    } else {
      const r = await query(
        `SELECT id, phone, name, is_online, (push_token IS NOT NULL AND push_token <> '') AS has_push,
                created_at, last_seen
         FROM users
         ORDER BY id DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset],
      );
      res.json({ success: true, users: r.rows });
    }
  } catch (err) {
    logger.error({ err }, "admin /users");
    res.status(500).json({ success: false, message: "Users query failed" });
  }
});

router.get("/chats", requireAdmin, async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query["limit"]) || 40));
  const offset = Math.max(0, Number(req.query["offset"]) || 0);
  try {
    const r = await query(
      `SELECT c.id, c.is_group, c.group_name, c.group_messaging_policy, c.created_at,
              (SELECT COUNT(*)::int FROM chat_members cm WHERE cm.chat_id = c.id) AS member_count,
              (SELECT COUNT(*)::int FROM messages m WHERE m.chat_id = c.id) AS message_count
       FROM chats c
       ORDER BY c.id DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    res.json({ success: true, chats: r.rows });
  } catch (err) {
    logger.error({ err }, "admin /chats");
    res.status(500).json({ success: false, message: "Chats query failed" });
  }
});

router.post("/groups/create", requireAdmin, async (req, res) => {
  const body = req.body as {
    groupName?: string;
    creatorPhone?: string;
    creatorUserId?: number;
    memberPhones?: string[] | string;
    adminPhones?: string[] | string;
    groupAvatarUrl?: string | null;
    description?: string | null;
  };
  const groupName = String(body.groupName ?? "").trim();
  if (groupName.length < 3) {
    res.status(400).json({ success: false, message: "Group name must be at least 3 characters." });
    return;
  }

  const creatorUserIdInput = Number(body.creatorUserId);
  const creatorPhone = String(body.creatorPhone ?? "").trim();
  const creatorPhoneKey = phoneKey(creatorPhone);
  if (!creatorUserIdInput && !creatorPhoneKey) {
    res.status(400).json({ success: false, message: "Provide creatorUserId or creatorPhone." });
    return;
  }

  const memberPhonesRaw = splitPhoneList(body.memberPhones);
  const memberPhoneKeys = Array.from(new Set(memberPhonesRaw.map(phoneKey).filter((x) => x.length >= 10)));
  if (memberPhoneKeys.length === 0) {
    res.status(400).json({ success: false, message: "Add at least one member phone number." });
    return;
  }
  if (memberPhoneKeys.length > MAX_ADMIN_GROUP_MEMBERS) {
    res.status(400).json({
      success: false,
      message: `Max ${MAX_ADMIN_GROUP_MEMBERS} member numbers are allowed per admin-created group.`,
    });
    return;
  }

  const adminPhonesRaw = splitPhoneList(body.adminPhones);
  const adminPhoneKeys = new Set(adminPhonesRaw.map(phoneKey).filter((x) => x.length >= 10));

  try {
    let creatorId = creatorUserIdInput || 0;
    if (!creatorId) {
      const cr = await query(
        `SELECT id FROM users
         WHERE regexp_replace(phone, '\D', '', 'g') = $1
         LIMIT 1`,
        [creatorPhoneKey],
      );
      if (!cr.rows[0]?.id) {
        res.status(404).json({ success: false, message: "Creator phone is not registered on Videh." });
        return;
      }
      creatorId = Number(cr.rows[0].id);
    } else {
      const cr = await query("SELECT id FROM users WHERE id = $1 LIMIT 1", [creatorId]);
      if (!cr.rows[0]?.id) {
        res.status(404).json({ success: false, message: "creatorUserId was not found." });
        return;
      }
    }

    const usersRes = await query(
      `SELECT id, phone, regexp_replace(phone, '\D', '', 'g') AS phone_key
       FROM users
       WHERE regexp_replace(phone, '\D', '', 'g') = ANY($1::text[])`,
      [memberPhoneKeys],
    );

    const phoneToUserId = new Map<string, number>();
    for (const r of usersRes.rows as Array<{ id: number; phone_key: string }>) {
      if (r.phone_key) phoneToUserId.set(r.phone_key, Number(r.id));
    }

    const foundUserIds: number[] = [];
    const missingPhones: string[] = [];
    for (const pk of memberPhoneKeys) {
      const uid = phoneToUserId.get(pk);
      if (uid) foundUserIds.push(uid);
      else missingPhones.push(pk);
    }

    const allMemberIds = Array.from(new Set([creatorId, ...foundUserIds]));
    if (allMemberIds.length > MAX_ADMIN_GROUP_MEMBERS) {
      res.status(400).json({
        success: false,
        message: `Registered members exceed ${MAX_ADMIN_GROUP_MEMBERS}.`,
      });
      return;
    }

    const newChat = await query(
      `INSERT INTO chats (is_group, group_name, group_avatar_url, group_description, created_by)
       VALUES (TRUE, $1, $2, $3, $4)
       RETURNING id`,
      [groupName, body.groupAvatarUrl ?? null, body.description ?? null, creatorId],
    );
    const chatId = Number(newChat.rows[0].id);

    const adminIdSet = new Set<number>([creatorId]);
    for (const pk of adminPhoneKeys) {
      const uid = phoneToUserId.get(pk);
      if (uid) adminIdSet.add(uid);
    }

    const chunkSize = 500;
    for (let start = 0; start < allMemberIds.length; start += chunkSize) {
      const chunk = allMemberIds.slice(start, start + chunkSize);
      const valuesSql: string[] = [];
      const params: Array<number | string | boolean> = [];
      for (let i = 0; i < chunk.length; i++) {
        const uid = chunk[i]!;
        const isAdmin = adminIdSet.has(uid);
        const p = i * 4;
        valuesSql.push(`($${p + 1}, $${p + 2}, $${p + 3}, $${p + 4})`);
        params.push(chatId, uid, isAdmin, true);
      }
      await query(
        `INSERT INTO chat_members (chat_id, user_id, is_admin, can_send_messages)
         VALUES ${valuesSql.join(", ")}
         ON CONFLICT (chat_id, user_id) DO NOTHING`,
        params,
      );
    }

    res.json({
      success: true,
      chatId,
      groupName,
      creatorId,
      totalInputPhones: memberPhoneKeys.length,
      registeredAddedMembers: allMemberIds.length,
      adminsSet: Array.from(adminIdSet).length,
      notOnVidehPhones: missingPhones,
      message: `Group created. ${allMemberIds.length} registered users were added.`,
    });
  } catch (err) {
    logger.error({ err }, "admin /groups/create");
    res.status(500).json({ success: false, message: "Could not create admin group." });
  }
});

router.get("/scheduled", requireAdmin, async (req, res) => {
  const limit = Math.min(80, Math.max(1, Number(req.query["limit"]) || 40));
  try {
    const r = await query(
      `SELECT sm.id, sm.chat_id, sm.sender_id, u.name AS sender_name, sm.content, sm.type,
              sm.scheduled_at, sm.sent, sm.created_at
       FROM scheduled_messages sm
       JOIN users u ON u.id = sm.sender_id
       ORDER BY sm.scheduled_at DESC
       LIMIT $1`,
      [limit],
    );
    res.json({ success: true, scheduled: r.rows });
  } catch (err) {
    logger.error({ err }, "admin /scheduled");
    res.status(500).json({ success: false, message: "Scheduled query failed" });
  }
});

router.get("/calls", requireAdmin, async (req, res) => {
  const limit = Math.min(80, Math.max(1, Number(req.query["limit"]) || 40));
  try {
    const r = await query(
      `SELECT c.id, c.type, c.status, c.duration_seconds, c.created_at,
              uc.name AS caller_name, ur.name AS callee_name
       FROM calls c
       JOIN users uc ON uc.id = c.caller_id
       JOIN users ur ON ur.id = c.callee_id
       ORDER BY c.id DESC
       LIMIT $1`,
      [limit],
    );
    res.json({ success: true, calls: r.rows });
  } catch (err) {
    logger.error({ err }, "admin /calls");
    res.status(500).json({ success: false, message: "Calls query failed" });
  }
});

router.get("/broadcasts", requireAdmin, async (_req, res) => {
  try {
    const r = await query(
      `SELECT bl.id, bl.name, bl.created_at, u.name AS creator_name,
              (SELECT COUNT(*)::int FROM broadcast_recipients br WHERE br.list_id = bl.id) AS recipient_count
       FROM broadcast_lists bl
       JOIN users u ON u.id = bl.creator_id
       ORDER BY bl.id DESC
       LIMIT 50`,
      [],
    );
    res.json({ success: true, broadcasts: r.rows });
  } catch (err) {
    logger.error({ err }, "admin /broadcasts");
    res.status(500).json({ success: false, message: "Broadcasts query failed" });
  }
});

export default router;

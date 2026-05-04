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

import { Router, type Request, type Response } from "express";
import { query } from "../lib/db";
import { EXPO_CHAT_MESSAGE_CATEGORY_ID, isExpoPushToken, sendExpoChatPush } from "../lib/expoPush";
import { assertSameUser, issueSessionToken } from "../lib/auth";

const router = Router();

let reportTablesEnsured = false;
async function ensureReportTables() {
  if (reportTablesEnsured) return;
  await query(`
    CREATE TABLE IF NOT EXISTS user_reports (
      id SERIAL PRIMARY KEY,
      reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reported_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      chat_id INTEGER REFERENCES chats(id) ON DELETE SET NULL,
      reason TEXT NOT NULL DEFAULT 'reported_by_user',
      details TEXT,
      block_after_report BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  reportTablesEnsured = true;
}

// Register or login user (called after OTP verification)
router.post("/register", async (req: Request, res: Response) => {
  const { phone } = req.body as { phone?: string };
  if (!phone) { res.status(400).json({ success: false, message: "Phone required" }); return; }

  try {
    const existing = await query("SELECT * FROM users WHERE phone = $1", [phone]);
    if (existing.rows.length > 0) {
      const user = existing.rows[0];
      await query("UPDATE users SET is_online = TRUE, last_seen = NOW() WHERE id = $1", [user.id]);
      res.json({ success: true, user: { ...user, is_online: true }, sessionToken: issueSessionToken(user.id) });
    } else {
      const result = await query(
        "INSERT INTO users (phone, is_online) VALUES ($1, TRUE) RETURNING *",
        [phone]
      );
      res.json({ success: true, user: result.rows[0], isNew: true, sessionToken: issueSessionToken(result.rows[0].id) });
    }
  } catch (err) {
    req.log.error({ err }, "register error");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Check single phone number exists (must be before /:id)
router.get("/check-phone", async (req: Request, res: Response) => {
  const { phone } = req.query as { phone?: string };
  if (!phone) { res.status(400).json({ success: false }); return; }
  try {
    const r = await query("SELECT id FROM users WHERE phone = $1", [phone]);
    res.json({ success: true, exists: r.rows.length > 0 });
  } catch { res.status(500).json({ success: false }); }
});

// Get user profile
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const result = await query("SELECT id, phone, name, about, avatar_url, is_online, last_seen FROM users WHERE id = $1", [req.params.id]);
    if (result.rows.length === 0) { res.status(404).json({ success: false, message: "User not found" }); return; }
    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Update profile (name, about)
router.put("/:id", async (req: Request, res: Response) => {
  const { name, about } = req.body as { name?: string; about?: string };
  if (!assertSameUser(req, res, req.params.id)) return;
  try {
    const result = await query(
      "UPDATE users SET name = COALESCE($1, name), about = COALESCE($2, about), updated_at = NOW() WHERE id = $3 RETURNING *",
      [name ?? null, about ?? null, req.params.id]
    );
    if (result.rows.length === 0) { res.status(404).json({ success: false }); return; }
    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Upload avatar (base64)
router.post("/:id/avatar", async (req: Request, res: Response) => {
  const { base64, mimeType } = req.body as { base64?: string; mimeType?: string };
  if (!base64) { res.status(400).json({ success: false, message: "base64 data required" }); return; }
  if (!assertSameUser(req, res, req.params.id)) return;

  try {
    const dataUrl = `data:${mimeType ?? "image/jpeg"};base64,${base64}`;
    const result = await query(
      "UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2 RETURNING id, avatar_url",
      [dataUrl, req.params.id]
    );
    res.json({ success: true, avatarUrl: result.rows[0]?.avatar_url });
  } catch (err) {
    req.log.error({ err }, "avatar upload error");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Set online
router.post("/:id/online", async (req: Request, res: Response) => {
  if (!assertSameUser(req, res, req.params.id)) return;
  try {
    await query("UPDATE users SET is_online = TRUE WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch { res.status(500).json({ success: false }); }
});

// Set offline
router.post("/:id/offline", async (req: Request, res: Response) => {
  if (!assertSameUser(req, res, req.params.id)) return;
  try {
    await query("UPDATE users SET is_online = FALSE, last_seen = NOW() WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// Block user
router.post("/:id/block", async (req: Request, res: Response) => {
  const { blockerId } = req.body as { blockerId?: number };
  if (!blockerId) { res.status(400).json({ success: false }); return; }
  if (!assertSameUser(req, res, blockerId)) return;
  try {
    await query(
      "INSERT INTO blocked_users (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [blockerId, req.params.id]
    );
    res.json({ success: true });
  } catch { res.status(500).json({ success: false }); }
});

// Check block relationship between two users
router.get("/:id/block-status", async (req: Request, res: Response) => {
  const otherUserId = Number(req.query["otherUserId"]);
  const userId = Number(req.params.id);
  if (!userId || !otherUserId) { res.status(400).json({ success: false }); return; }
  try {
    const r = await query(`
      SELECT
        EXISTS(SELECT 1 FROM blocked_users WHERE blocker_id = $1 AND blocked_id = $2) AS i_blocked_them,
        EXISTS(SELECT 1 FROM blocked_users WHERE blocker_id = $2 AND blocked_id = $1) AS they_blocked_me
    `, [userId, otherUserId]);
    res.json({ success: true, ...r.rows[0] });
  } catch { res.status(500).json({ success: false }); }
});

// Unblock user
router.delete("/:id/block", async (req: Request, res: Response) => {
  const { blockerId } = req.body as { blockerId?: number };
  if (!assertSameUser(req, res, blockerId)) return;
  try {
    await query("DELETE FROM blocked_users WHERE blocker_id = $1 AND blocked_id = $2", [blockerId, req.params.id]);
    res.json({ success: true });
  } catch { res.status(500).json({ success: false }); }
});

// Get blocked users
router.get("/:id/blocked", async (req: Request, res: Response) => {
  try {
    const result = await query(`
      SELECT u.id, u.name, u.phone, u.avatar_url FROM blocked_users b
      JOIN users u ON u.id = b.blocked_id WHERE b.blocker_id = $1
    `, [req.params.id]);
    res.json({ success: true, blocked: result.rows });
  } catch { res.status(500).json({ success: false }); }
});

// Report user or chat, optionally block reported user
router.post("/:id/report", async (req: Request, res: Response) => {
  const reportedUserId = Number(req.params.id);
  const { reporterId, chatId, reason, details, block } = req.body as {
    reporterId?: number; chatId?: number; reason?: string; details?: string; block?: boolean;
  };
  if (!reporterId || !reportedUserId) { res.status(400).json({ success: false }); return; }
  if (!assertSameUser(req, res, reporterId)) return;
  try {
    await ensureReportTables();
    await query(`
      INSERT INTO user_reports (reporter_id, reported_user_id, chat_id, reason, details, block_after_report)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [reporterId, reportedUserId, chatId ?? null, reason ?? "reported_by_user", details ?? null, Boolean(block)]);
    if (block) {
      await query(
        "INSERT INTO blocked_users (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [reporterId, reportedUserId],
      );
    }
    res.json({ success: true });
  } catch { res.status(500).json({ success: false }); }
});

// Bulk check which phone numbers are registered on Videh
router.post("/check-phones", async (req: Request, res: Response) => {
  const { phones } = req.body as { phones?: string[] };
  if (!phones || !Array.isArray(phones) || phones.length === 0) {
    res.status(400).json({ success: false, message: "phones array required" });
    return;
  }
  try {
    const placeholders = phones.map((_: string, i: number) => `$${i + 1}`).join(", ");
    const result = await query(
      `SELECT id, phone, name, about, avatar_url FROM users WHERE phone = ANY(ARRAY[${placeholders}])`,
      phones
    );
    const registered: Record<string, any> = {};
    for (const row of result.rows) {
      registered[row.phone] = {
        id: row.id,
        phone: row.phone,
        name: row.name ?? row.phone,
        about: row.about,
        avatarUrl: row.avatar_url,
      };
    }
    res.json({ success: true, registered });
  } catch (err) {
    req.log.error({ err }, "check-phones error");
    res.status(500).json({ success: false });
  }
});

// PATCH: partial update (phone, preferredLang, fontSize)
router.patch("/:id", async (req: Request, res: Response) => {
  const { phone, preferredLang, fontSize } = req.body as any;
  try {
    const result = await query(
      `UPDATE users SET 
        phone = COALESCE($1, phone),
        preferred_lang = COALESCE($2, preferred_lang),
        font_size = COALESCE($3, font_size),
        updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [phone ?? null, preferredLang ?? null, fontSize ?? null, req.params.id]
    );
    if (result.rows.length === 0) { res.status(404).json({ success: false }); return; }
    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Two-step verification status
router.get("/:id/two-step-status", async (req: Request, res: Response) => {
  try {
    const r = await query("SELECT two_step_pin FROM users WHERE id = $1", [req.params.id]);
    if (r.rows.length === 0) { res.status(404).json({ success: false }); return; }
    res.json({ success: true, enabled: !!r.rows[0].two_step_pin });
  } catch { res.status(500).json({ success: false }); }
});

// Set two-step PIN
router.post("/:id/two-step-pin", async (req: Request, res: Response) => {
  const { pin } = req.body as { pin?: string };
  if (!assertSameUser(req, res, req.params.id)) return;
  if (!pin || pin.length !== 6 || !/^\d+$/.test(pin)) {
    res.status(400).json({ success: false, message: "6-digit numeric PIN required" }); return;
  }
  try {
    await query("UPDATE users SET two_step_pin = $1 WHERE id = $2", [pin, req.params.id]);
    res.json({ success: true });
  } catch { res.status(500).json({ success: false }); }
});

// Remove two-step PIN
router.delete("/:id/two-step-pin", async (req: Request, res: Response) => {
  const { pin } = req.body as { pin?: string };
  if (!assertSameUser(req, res, req.params.id)) return;
  try {
    const r = await query("SELECT two_step_pin FROM users WHERE id = $1", [req.params.id]);
    if (!r.rows[0] || r.rows[0].two_step_pin !== pin) {
      res.status(403).json({ success: false, message: "PIN galat hai" }); return;
    }
    await query("UPDATE users SET two_step_pin = NULL WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch { res.status(500).json({ success: false }); }
});

/** After OTP: confirm 6-digit account PIN before completing login. */
router.post("/:id/verify-two-step", async (req: Request, res: Response) => {
  const { pin } = req.body as { pin?: string };
  if (!pin || pin.length !== 6 || !/^\d+$/.test(pin)) {
    res.status(400).json({ success: false, message: "6-digit numeric PIN required" });
    return;
  }
  try {
    const r = await query(
      "SELECT id, phone, name, about, avatar_url, two_step_pin FROM users WHERE id = $1",
      [req.params.id],
    );
    if (r.rows.length === 0) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }
    const row = r.rows[0] as {
      id: number;
      phone: string;
      name?: string | null;
      about?: string | null;
      avatar_url?: string | null;
      two_step_pin?: string | null;
    };
    if (!row.two_step_pin) {
      res.json({
        success: true,
        noPin: true,
        name: row.name ?? null,
        about: row.about ?? null,
        avatarUrl: row.avatar_url ?? null,
        sessionToken: issueSessionToken(row.id),
      });
      return;
    }
    if (row.two_step_pin !== pin) {
      res.status(403).json({ success: false, message: "Incorrect PIN" });
      return;
    }
    res.json({
      success: true,
      name: row.name ?? null,
      about: row.about ?? null,
      avatarUrl: row.avatar_url ?? null,
      sessionToken: issueSessionToken(row.id),
    });
  } catch (err) {
    req.log.error({ err }, "verify-two-step error");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Storage stats
router.get("/:id/storage-stats", async (req: Request, res: Response) => {
  if (!assertSameUser(req, res, req.params.id)) return;
  try {
    const stats = await query(`
      SELECT 
        COUNT(DISTINCT c.id)::int as total_chats,
        COUNT(m.id)::int as total_messages,
        COUNT(CASE WHEN m.type != 'text' THEN 1 END)::int as media_messages,
        COUNT(CASE WHEN m.type = 'text' THEN 1 END)::int as text_messages
      FROM chat_members cm
      JOIN chats c ON c.id = cm.chat_id
      LEFT JOIN messages m ON m.chat_id = c.id AND m.is_deleted = FALSE
      WHERE cm.user_id = $1
    `, [req.params.id]);
    res.json({ success: true, stats: stats.rows[0] });
  } catch { res.status(500).json({ success: false }); }
});

// Save push token
router.put("/:id/push-token", async (req: Request, res: Response) => {
  const { token } = req.body as { token?: string };
  if (!assertSameUser(req, res, req.params.id)) return;
  if (!isExpoPushToken(token)) {
    res.status(400).json({ success: false, message: "Invalid Expo push token" });
    return;
  }
  try {
    const result = await query("UPDATE users SET push_token = $1 WHERE id = $2 RETURNING id", [token, req.params.id]);
    if (!result.rows[0]) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }
    res.json({ success: true, hasPush: true });
  } catch (err) {
    req.log.error({ err }, "save push token");
    res.status(500).json({ success: false });
  }
});

router.post("/:id/test-push", async (req: Request, res: Response) => {
  try {
    const r = await query("SELECT push_token FROM users WHERE id = $1", [req.params.id]);
    const token = r.rows[0]?.push_token;
    if (!isExpoPushToken(token)) {
      res.status(404).json({ success: false, message: "No valid push token saved for this user." });
      return;
    }
    sendExpoChatPush(
      token,
      "Videh test notification",
      "Push notifications are working.",
      { type: "test", notificationKind: "chat_message" },
      { categoryId: EXPO_CHAT_MESSAGE_CATEGORY_ID, threadId: "test-push" },
    );
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "test push");
    res.status(500).json({ success: false });
  }
});

// Search users by phone
router.get("/search/:phone", async (req: Request, res: Response) => {
  try {
    const result = await query(
      "SELECT id, phone, name, about, avatar_url, is_online FROM users WHERE phone LIKE $1 LIMIT 20",
      [`%${req.params.phone}%`]
    );
    res.json({ success: true, users: result.rows });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

export default router;

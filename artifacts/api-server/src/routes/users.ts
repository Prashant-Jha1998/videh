import { Router, type Request, type Response } from "express";
import { query } from "../lib/db";
import { EXPO_CHAT_MESSAGE_CATEGORY_ID } from "../lib/expoPush";
import { isValidPushToken, sendChatPush } from "../lib/pushNotify";
import { assertSameUser, getAuthUserId, issueSessionToken, requireAuth } from "../lib/auth";
import { clientIp, isRateLimited } from "../lib/rateLimit";
import {
  ensurePrivacyColumns,
  getPresenceForViewer,
  getUserPrivacy,
  privacyLabels,
  type LastSeenPrivacy,
  type OnlinePrivacy,
} from "../lib/presencePrivacy";
import {
  canSeeUserField,
  disappearLabel,
  ensureExtendedPrivacyColumns,
  fieldPrivacyLabel,
  getExtendedPrivacy,
  labelToFieldPrivacy,
  type FieldPrivacy,
} from "../lib/userPrivacySettings";

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

// Privacy settings (must be before /:id)
router.get("/:id/privacy", async (req: Request, res: Response) => {
  if (!assertSameUser(req, res, req.params.id)) return;
  try {
    await ensurePrivacyColumns();
    await ensureExtendedPrivacyColumns();
    const privacy = await getUserPrivacy(Number(req.params.id));
    const extended = await getExtendedPrivacy(Number(req.params.id));
    if (!privacy || !extended) { res.status(404).json({ success: false }); return; }
    const labels = privacyLabels(privacy.last_seen_privacy, privacy.online_privacy);
    res.json({
      success: true,
      lastSeenPrivacy: privacy.last_seen_privacy,
      onlinePrivacy: privacy.online_privacy,
      lastSeenExceptIds: privacy.last_seen_except_ids,
      lastSeenLabel: labels.lastSeenLabel,
      onlineLabel: labels.onlineLabel,
      profilePhotoPrivacy: extended.profile_photo_privacy,
      profilePhotoLabel: fieldPrivacyLabel(extended.profile_photo_privacy),
      aboutPrivacy: extended.about_privacy,
      aboutLabel: fieldPrivacyLabel(extended.about_privacy),
      statusPrivacy: extended.status_privacy,
      statusLabel: fieldPrivacyLabel(extended.status_privacy),
      groupsPrivacy: extended.groups_privacy,
      groupsLabel: fieldPrivacyLabel(extended.groups_privacy),
      readReceiptsEnabled: extended.read_receipts_enabled,
      defaultDisappearSeconds: extended.default_disappear_seconds,
      disappearLabel: disappearLabel(extended.default_disappear_seconds),
      silenceUnknownCallers: extended.silence_unknown_callers,
    });
  } catch (err) {
    req.log.error({ err }, "get privacy");
    res.status(500).json({ success: false });
  }
});

router.patch("/:id/privacy", async (req: Request, res: Response) => {
  if (!assertSameUser(req, res, req.params.id)) return;
  const body = req.body as {
    lastSeenPrivacy?: LastSeenPrivacy;
    onlinePrivacy?: OnlinePrivacy;
    lastSeenExceptIds?: number[];
    profilePhotoPrivacy?: FieldPrivacy;
    aboutPrivacy?: FieldPrivacy;
    statusPrivacy?: FieldPrivacy;
    groupsPrivacy?: FieldPrivacy;
    readReceiptsEnabled?: boolean;
    defaultDisappearSeconds?: number | null;
    silenceUnknownCallers?: boolean;
  };
  try {
    await ensurePrivacyColumns();
    await ensureExtendedPrivacyColumns();
    const current = await getUserPrivacy(Number(req.params.id));
    const extended = await getExtendedPrivacy(Number(req.params.id));
    if (!current || !extended) { res.status(404).json({ success: false }); return; }
    const lastSeen = body.lastSeenPrivacy ?? current.last_seen_privacy;
    const online = body.onlinePrivacy ?? current.online_privacy;
    const exceptIds = Array.isArray(body.lastSeenExceptIds)
      ? body.lastSeenExceptIds.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0)
      : current.last_seen_except_ids;
    const profilePhoto = body.profilePhotoPrivacy ?? extended.profile_photo_privacy;
    const about = body.aboutPrivacy ?? extended.about_privacy;
    const status = body.statusPrivacy ?? extended.status_privacy;
    const groups = body.groupsPrivacy ?? extended.groups_privacy;
    const readReceipts =
      typeof body.readReceiptsEnabled === "boolean"
        ? body.readReceiptsEnabled
        : extended.read_receipts_enabled;
    const disappearSeconds =
      body.defaultDisappearSeconds !== undefined
        ? body.defaultDisappearSeconds
        : extended.default_disappear_seconds;
    const silenceUnknown =
      typeof body.silenceUnknownCallers === "boolean"
        ? body.silenceUnknownCallers
        : extended.silence_unknown_callers;
    await query(
      `UPDATE users SET
        last_seen_privacy = $1,
        online_privacy = $2,
        last_seen_except_ids = $3::jsonb,
        profile_photo_privacy = $4,
        about_privacy = $5,
        status_privacy = $6,
        groups_privacy = $7,
        read_receipts_enabled = $8,
        default_disappear_seconds = $9,
        silence_unknown_callers = $10,
        updated_at = NOW()
       WHERE id = $11`,
      [
        lastSeen,
        online,
        JSON.stringify(exceptIds),
        profilePhoto,
        about,
        status,
        groups,
        readReceipts,
        disappearSeconds,
        silenceUnknown,
        req.params.id,
      ],
    );
    const labels = privacyLabels(lastSeen, online);
    res.json({
      success: true,
      lastSeenPrivacy: lastSeen,
      onlinePrivacy: online,
      lastSeenExceptIds: exceptIds,
      lastSeenLabel: labels.lastSeenLabel,
      onlineLabel: labels.onlineLabel,
      profilePhotoPrivacy: profilePhoto,
      profilePhotoLabel: fieldPrivacyLabel(profilePhoto),
      aboutPrivacy: about,
      aboutLabel: fieldPrivacyLabel(about),
      statusPrivacy: status,
      statusLabel: fieldPrivacyLabel(status),
      groupsPrivacy: groups,
      groupsLabel: fieldPrivacyLabel(groups),
      readReceiptsEnabled: readReceipts,
      defaultDisappearSeconds: disappearSeconds,
      disappearLabel: disappearLabel(disappearSeconds),
      silenceUnknownCallers: silenceUnknown,
    });
  } catch (err) {
    req.log.error({ err }, "patch privacy");
    res.status(500).json({ success: false });
  }
});

// Presence for chat header (authenticated viewer)
router.get("/:id/presence", async (req: Request, res: Response) => {
  const viewerId = getAuthUserId(req);
  if (!viewerId) { res.status(401).json({ success: false, message: "Authentication required" }); return; }
  const targetId = Number(req.params.id);
  if (!targetId) { res.status(400).json({ success: false }); return; }
  try {
    const presence = await getPresenceForViewer(viewerId, targetId);
    res.json({ success: true, presence });
  } catch (err) {
    req.log.error({ err }, "get presence");
    res.status(500).json({ success: false });
  }
});

// Get user profile
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const result = await query("SELECT id, phone, name, about, avatar_url, is_online, last_seen FROM users WHERE id = $1", [req.params.id]);
    if (result.rows.length === 0) { res.status(404).json({ success: false, message: "User not found" }); return; }
    const viewerId = getAuthUserId(req);
    let user = result.rows[0];
    if (viewerId && viewerId !== Number(req.params.id)) {
      const targetId = Number(req.params.id);
      const [presence, seePhoto, seeAbout] = await Promise.all([
        getPresenceForViewer(viewerId, targetId),
        canSeeUserField(viewerId, targetId, "profile_photo_privacy"),
        canSeeUserField(viewerId, targetId, "about_privacy"),
      ]);
      user = {
        ...user,
        is_online: presence.canSee ? presence.isOnline : false,
        last_seen: presence.canSee ? presence.lastSeen : null,
        avatar_url: seePhoto ? user.avatar_url : null,
        about: seeAbout ? user.about : null,
      };
    }
    res.json({ success: true, user });
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

// Bulk check which phone numbers are registered on Videh (authenticated + rate limited)
router.post("/check-phones", requireAuth, async (req: Request, res: Response) => {
  const authUserId = getAuthUserId(req);
  if (!authUserId) {
    res.status(401).json({ success: false, message: "Authentication required" });
    return;
  }
  const rateKey = `check-phones:${authUserId}:${clientIp(req)}`;
  if (isRateLimited(rateKey, 30, 60_000)) {
    res.status(429).json({ success: false, message: "Too many requests. Try again shortly." });
    return;
  }

  const { phones } = req.body as { phones?: string[] };
  if (!phones || !Array.isArray(phones) || phones.length === 0) {
    res.status(400).json({ success: false, message: "phones array required" });
    return;
  }
  if (phones.length > 500) {
    res.status(400).json({ success: false, message: "Maximum 500 phone numbers per request." });
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
router.put("/:id/sound-prefs", async (req: Request, res: Response) => {
  if (!assertSameUser(req, res, req.params.id)) return;
  const body = req.body as {
    globalMessageSound?: string;
    globalGroupMessageSound?: string;
    globalCallSound?: string;
    chatMessageSounds?: Record<string, string>;
    chatPresets?: Record<string, string>;
  };
  try {
    const { upsertUserSoundPrefs } = await import("../lib/soundPrefsDb");
    await upsertUserSoundPrefs(Number(req.params.id), {
      global_message_sound: body.globalMessageSound,
      global_group_message_sound: body.globalGroupMessageSound,
      global_call_sound: body.globalCallSound,
      chat_message_sounds: body.chatMessageSounds,
      chat_presets: body.chatPresets,
    });
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "save sound prefs");
    res.status(500).json({ success: false });
  }
});

router.put("/:id/push-token", async (req: Request, res: Response) => {
  const { token, provider } = req.body as { token?: string; provider?: string };
  if (!assertSameUser(req, res, req.params.id)) return;
  if (!isValidPushToken(token)) {
    res.status(400).json({ success: false, message: "Invalid push token (FCM, Expo, or Web Push required)" });
    return;
  }
  try {
    const result = await query("UPDATE users SET push_token = $1 WHERE id = $2 RETURNING id", [token, req.params.id]);
    if (!result.rows[0]) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }
    req.log.info({ userId: req.params.id, provider: provider ?? "auto" }, "push token saved");
    res.json({ success: true, hasPush: true, provider: provider ?? "auto" });
  } catch (err) {
    req.log.error({ err }, "save push token");
    res.status(500).json({ success: false });
  }
});

router.post("/:id/test-push", async (req: Request, res: Response) => {
  try {
    const r = await query("SELECT push_token FROM users WHERE id = $1", [req.params.id]);
    const token = r.rows[0]?.push_token;
    if (!isValidPushToken(token)) {
      res.status(404).json({ success: false, message: "No valid push token saved for this user." });
      return;
    }
    await sendChatPush(
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

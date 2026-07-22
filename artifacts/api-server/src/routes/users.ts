import { Router, type Request, type Response } from "express";
import { query } from "../lib/db";
import { EXPO_CHAT_MESSAGE_CATEGORY_ID } from "../lib/expoPush";
import { isValidPushToken, sendChatPush } from "../lib/pushNotify";
import {
  assertSameUser,
  getAuthUserId,
  issueSessionToken,
  requireAuth,
  verifyPhoneChangeTicket,
  verifyTwoStepTicket,
} from "../lib/auth";
import {
  activeLockExpiry,
  clearLoginGuard,
  readLoginGuard,
  registerLoginFailure,
  retryAfterSeconds,
} from "../lib/loginAttemptGuard";
import { clientIp, isRateLimited } from "../lib/rateLimit";
import { hashTwoStepPin, isTwoStepEnabled, verifyTwoStepPin } from "../lib/twoStepPin";
import {
  ensureNotificationPrefsColumn,
  getNotificationPrefs,
  setNotificationPrefs,
} from "../lib/notificationPrefs";
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
import { replaceUserSyncedContacts } from "../lib/userSyncedContacts";

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

// Register without OTP is disabled — login must go through /api/otp/verify.
router.post("/register", async (_req: Request, res: Response) => {
  res.status(403).json({
    success: false,
    message: "Direct registration is disabled. Complete OTP verification to sign in.",
  });
});

// Check single phone number exists (must be before /:id)
router.get("/check-phone", requireAuth, async (req: Request, res: Response) => {
  const raw = (req.query as { phone?: string }).phone ?? "";
  const digits = raw.replace(/\D/g, "");
  const fullPhone =
    digits.length === 10 ? `+91${digits}` : raw.startsWith("+") ? raw : digits.length === 12 ? `+${digits}` : raw;
  if (!fullPhone) { res.status(400).json({ success: false }); return; }
  try {
    const r = await query("SELECT id FROM users WHERE phone = $1", [fullPhone]);
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
    const viewerId = getAuthUserId(req);
    if (!viewerId) {
      res.status(401).json({ success: false, message: "Authentication required" });
      return;
    }
    const result = await query("SELECT id, phone, name, about, avatar_url, is_online, last_seen FROM users WHERE id = $1", [req.params.id]);
    if (result.rows.length === 0) { res.status(404).json({ success: false, message: "User not found" }); return; }
    let user = result.rows[0];
    const targetId = Number(req.params.id);
    if (viewerId !== targetId) {
      const [presence, seePhoto, seeAbout] = await Promise.all([
        getPresenceForViewer(viewerId, targetId),
        canSeeUserField(viewerId, targetId, "profile_photo_privacy"),
        canSeeUserField(viewerId, targetId, "about_privacy"),
      ]);
      user = {
        ...user,
        phone: undefined,
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

// Set online (heartbeat — last_seen drives freshness for chat-list dots)
router.post("/:id/online", async (req: Request, res: Response) => {
  if (!assertSameUser(req, res, req.params.id)) return;
  try {
    await query("UPDATE users SET is_online = TRUE, last_seen = NOW() WHERE id = $1", [req.params.id]);
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
        EXISTS(SELECT 1 FROM blocked_users WHERE blocker_id = $2 AND blocked_id = $1) AS they_blocked_me,
        (
          SELECT COUNT(DISTINCT c.id)::int
          FROM chats c
          JOIN chat_members cm1 ON cm1.chat_id = c.id AND cm1.user_id = $1
          JOIN chat_members cm2 ON cm2.chat_id = c.id AND cm2.user_id = $2
          WHERE c.is_group = TRUE
        ) AS common_group_count
    `, [userId, otherUserId]);
    res.json({ success: true, ...r.rows[0] });
  } catch { res.status(500).json({ success: false }); }
});

// Business API channel profile (for Videh business chat intro)
router.get("/:id/business-channel", async (req: Request, res: Response) => {
  const userId = Number(req.params.id);
  if (!userId) {
    res.status(400).json({ success: false });
    return;
  }
  try {
    const { lookupBusinessChannelByUserId } = await import("../lib/businessChannelLookup");
    const channel = await lookupBusinessChannelByUserId(userId);
    if (!channel) {
      res.json({ success: true, isBusiness: false });
      return;
    }
    if (channel.logoUrl) {
      await query(
        `UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2`,
        [channel.logoUrl, userId],
      ).catch(() => null);
    }
    res.json({
      success: true,
      isBusiness: true,
      displayName: channel.displayName,
      logoUrl: channel.logoUrl,
      joinedAt: channel.joinedAt,
      businessAccountId: channel.businessAccountId,
      businessCategory: channel.businessCategory,
    });
  } catch {
    res.status(500).json({ success: false });
  }
});

router.get("/:id/business-marketing", async (req: Request, res: Response) => {
  const userId = Number(req.params.id);
  const businessUserId = Number(req.query.businessUserId);
  if (!userId || !businessUserId) {
    res.status(400).json({ success: false, message: "userId and businessUserId required" });
    return;
  }
  if (!assertSameUser(req, res, userId)) return;
  try {
    const { isBusinessMarketingStopped } = await import("../lib/businessMarketingPrefs");
    const stopped = await isBusinessMarketingStopped(userId, businessUserId);
    res.json({ success: true, marketingStopped: stopped });
  } catch {
    res.status(500).json({ success: false });
  }
});

router.post("/:id/business-marketing/stop", async (req: Request, res: Response) => {
  const userId = Number(req.params.id);
  const { businessUserId, chatId, businessName } = req.body as {
    businessUserId?: number;
    chatId?: number;
    businessName?: string;
  };
  if (!userId || !businessUserId || !chatId) {
    res.status(400).json({ success: false, message: "userId, businessUserId, and chatId required" });
    return;
  }
  if (!assertSameUser(req, res, userId)) return;
  try {
    const { setBusinessMarketingStopped } = await import("../lib/businessMarketingPrefs");
    const { insertChatSystemMessage } = await import("../lib/chatSystemMessages");
    await setBusinessMarketingStopped(userId, businessUserId, true);
    const name = String(businessName ?? "this business").trim() || "this business";
    const { messageId, content } = await insertChatSystemMessage(chatId, userId, {
      kind: "business_marketing_stopped",
      businessName: name,
      businessUserId,
    });
    res.json({ success: true, marketingStopped: true, messageId, message: { content, type: "system" } });
  } catch {
    res.status(500).json({ success: false });
  }
});

router.post("/:id/business-marketing/resume", async (req: Request, res: Response) => {
  const userId = Number(req.params.id);
  const { businessUserId, chatId, businessName } = req.body as {
    businessUserId?: number;
    chatId?: number;
    businessName?: string;
  };
  if (!userId || !businessUserId || !chatId) {
    res.status(400).json({ success: false, message: "userId, businessUserId, and chatId required" });
    return;
  }
  if (!assertSameUser(req, res, userId)) return;
  try {
    const { setBusinessMarketingStopped } = await import("../lib/businessMarketingPrefs");
    const { insertChatSystemMessage } = await import("../lib/chatSystemMessages");
    await setBusinessMarketingStopped(userId, businessUserId, false);
    const name = String(businessName ?? "this business").trim() || "this business";
    const { messageId, content } = await insertChatSystemMessage(chatId, userId, {
      kind: "business_marketing_resumed",
      businessName: name,
      businessUserId,
    });
    res.json({ success: true, marketingStopped: false, messageId, message: { content, type: "system" } });
  } catch {
    res.status(500).json({ success: false });
  }
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

// Sync phone address book from mobile app (powers Videh Web contact list)
router.post("/sync-contacts", requireAuth, async (req: Request, res: Response) => {
  const authUserId = getAuthUserId(req);
  if (!authUserId) {
    res.status(401).json({ success: false, message: "Authentication required" });
    return;
  }
  const rateKey = `sync-contacts:${authUserId}`;
  if (isRateLimited(rateKey, 12, 60_000)) {
    res.status(429).json({ success: false, message: "Syncing too often. Try again shortly." });
    return;
  }

  const { contacts } = req.body as { contacts?: Array<{ phone?: string; name?: string }> };
  if (!contacts || !Array.isArray(contacts)) {
    res.status(400).json({ success: false, message: "contacts array required" });
    return;
  }
  if (contacts.length > 2500) {
    res.status(400).json({ success: false, message: "Maximum 2500 contacts per sync." });
    return;
  }

  try {
    const synced = await replaceUserSyncedContacts(authUserId, contacts);
    res.json({ success: true, synced });
  } catch (err) {
    req.log.error({ err }, "sync-contacts error");
    res.status(500).json({ success: false, message: "Server error" });
  }
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
    const inputByDigits = new Map<string, string>();
    for (const raw of phones) {
      const digits = String(raw ?? "").replace(/\D/g, "");
      if (digits.length >= 10) inputByDigits.set(digits, raw);
    }
    const digitList = [...inputByDigits.keys()];
    if (digitList.length === 0) {
      res.json({ success: true, registered: {} });
      return;
    }

    const result = await query(
      `SELECT id, phone, name, about, avatar_url,
              regexp_replace(phone, '[^0-9]', '', 'g') AS phone_digits
       FROM users
       WHERE regexp_replace(phone, '[^0-9]', '', 'g') = ANY($1::text[])`,
      [digitList],
    );

    const byDigits = new Map<string, (typeof result.rows)[0]>();
    for (const row of result.rows) {
      byDigits.set(String(row.phone_digits), row);
    }

    const registered: Record<string, {
      id: number;
      phone: string;
      name: string;
      about: string | null;
      avatarUrl: string | null;
    }> = {};
    for (const [digits, inputPhone] of inputByDigits) {
      const row = byDigits.get(digits);
      if (!row) continue;
      registered[inputPhone] = {
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

// PATCH: preferredLang / fontSize. Phone only with OTP phoneChangeTicket.
router.patch("/:id", requireAuth, async (req: Request, res: Response) => {
  if (!assertSameUser(req, res, req.params.id)) return;
  const { phone, preferredLang, fontSize, phoneChangeTicket } = req.body as {
    phone?: string;
    preferredLang?: string;
    fontSize?: string;
    phoneChangeTicket?: string;
  };
  if (phone != null && String(phone).trim() !== "") {
    const nextPhone = String(phone).trim();
    if (!verifyPhoneChangeTicket(phoneChangeTicket, nextPhone)) {
      res.status(403).json({
        success: false,
        message: "Phone number change requires a fresh OTP verification.",
      });
      return;
    }
  }
  try {
    const result = await query(
      `UPDATE users SET 
        phone = COALESCE($1, phone),
        preferred_lang = COALESCE($2, preferred_lang),
        font_size = COALESCE($3, font_size),
        updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [phone?.trim() || null, preferredLang ?? null, fontSize ?? null, req.params.id]
    );
    if (result.rows.length === 0) { res.status(404).json({ success: false }); return; }
    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Two-step verification status (auth required — do not leak to strangers)
router.get("/:id/two-step-status", async (req: Request, res: Response) => {
  if (!assertSameUser(req, res, req.params.id)) return;
  try {
    const r = await query("SELECT two_step_pin FROM users WHERE id = $1", [req.params.id]);
    if (r.rows.length === 0) { res.status(404).json({ success: false }); return; }
    res.json({ success: true, enabled: isTwoStepEnabled(r.rows[0].two_step_pin) });
  } catch { res.status(500).json({ success: false }); }
});

// Set two-step PIN (stored hashed)
router.post("/:id/two-step-pin", async (req: Request, res: Response) => {
  const { pin } = req.body as { pin?: string };
  if (!assertSameUser(req, res, req.params.id)) return;
  if (!pin || pin.length !== 6 || !/^\d+$/.test(pin)) {
    res.status(400).json({ success: false, message: "6-digit numeric PIN required" }); return;
  }
  try {
    const hashed = await hashTwoStepPin(pin);
    await query("UPDATE users SET two_step_pin = $1 WHERE id = $2", [hashed, req.params.id]);
    res.json({ success: true });
  } catch { res.status(500).json({ success: false }); }
});

// Remove two-step PIN
router.delete("/:id/two-step-pin", async (req: Request, res: Response) => {
  const { pin } = req.body as { pin?: string };
  if (!assertSameUser(req, res, req.params.id)) return;
  try {
    const r = await query("SELECT two_step_pin FROM users WHERE id = $1", [req.params.id]);
    if (!r.rows[0] || !(await verifyTwoStepPin(req.params.id, String(pin ?? ""), r.rows[0].two_step_pin))) {
      res.status(403).json({ success: false, message: "PIN galat hai" }); return;
    }
    await query("UPDATE users SET two_step_pin = NULL WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch { res.status(500).json({ success: false }); }
});

/** After OTP: confirm 6-digit account PIN before completing login. Requires twoStepTicket from OTP verify. */
router.post("/:id/verify-two-step", async (req: Request, res: Response) => {
  const body = req.body as { pin?: string; twoStepTicket?: string };
  const { pin } = body;
  const userId = String(req.params.id ?? "");
  const authHeader = req.headers.authorization;
  const ticketFromHeader = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : undefined;
  const ticket = body.twoStepTicket?.trim() || ticketFromHeader;
  const ticketUserId = verifyTwoStepTicket(ticket, Number(userId));
  if (!ticketUserId) {
    res.status(401).json({
      success: false,
      message: "OTP login challenge expired or invalid. Please verify OTP again.",
    });
    return;
  }
  if (!pin || pin.length !== 6 || !/^\d+$/.test(pin)) {
    res.status(400).json({ success: false, message: "6-digit numeric PIN required" });
    return;
  }

  const ip = clientIp(req);
  if (isRateLimited(`twostep:ip:${ip}`, 30, 15 * 60 * 1000)) {
    res.status(429).json({ success: false, message: "Too many attempts. Please wait." });
    return;
  }

  const TWO_STEP_SCOPE = "twostep";
  const guard = await readLoginGuard(TWO_STEP_SCOPE, userId);
  const locked = activeLockExpiry(guard);
  if (locked) {
    const sec = retryAfterSeconds(locked);
    res.status(429).json({
      success: false,
      locked: true,
      retryAfterSeconds: sec,
      message: `Too many wrong PIN attempts. Try again in ${Math.ceil(sec / 60)} minutes.`,
    });
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
      // No PIN configured — do not mint a session from a stale challenge alone.
      res.status(400).json({
        success: false,
        noPin: true,
        message: "Two-step PIN is not enabled for this account. Sign in with OTP again.",
      });
      return;
    }
    if (!(await verifyTwoStepPin(row.id, pin, row.two_step_pin))) {
      const fail = await registerLoginFailure(TWO_STEP_SCOPE, userId, 15 * 60 * 1000);
      if (fail.locked) {
        res.status(429).json({
          success: false,
          locked: true,
          retryAfterSeconds: fail.retryAfterSeconds,
          message: `Too many wrong PIN attempts. Locked for ${Math.ceil(fail.retryAfterSeconds / 60)} minutes.`,
        });
        return;
      }
      res.status(403).json({
        success: false,
        attemptsRemaining: fail.attemptsRemaining,
        message:
          fail.attemptsRemaining === 1
            ? "Incorrect PIN. One attempt left before a 15-minute lock."
            : "Incorrect PIN",
      });
      return;
    }
    await clearLoginGuard(TWO_STEP_SCOPE, userId);
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

router.get("/:id/notification-prefs", async (req: Request, res: Response) => {
  if (!assertSameUser(req, res, req.params.id)) return;
  try {
    res.json({ success: true, prefs: await getNotificationPrefs(Number(req.params.id)) });
  } catch (err) {
    req.log.error({ err }, "get notification prefs");
    res.status(500).json({ success: false });
  }
});

router.put("/:id/notification-prefs", async (req: Request, res: Response) => {
  if (!assertSameUser(req, res, req.params.id)) return;
  try {
    const prefs = await setNotificationPrefs(Number(req.params.id), req.body ?? {});
    res.json({ success: true, prefs });
  } catch (err) {
    req.log.error({ err }, "set notification prefs");
    res.status(500).json({ success: false });
  }
});

/** Immediate account information report (privacy / data request). */
router.get("/:id/account-export", async (req: Request, res: Response) => {
  if (!assertSameUser(req, res, req.params.id)) return;
  const userId = Number(req.params.id);
  try {
    await ensureNotificationPrefsColumn();
    await ensureExtendedPrivacyColumns();
    const user = await query(
      `SELECT id, phone, name, about, avatar_url, preferred_lang, created_at, last_seen,
              profile_photo_privacy, about_privacy, status_privacy, groups_privacy,
              read_receipts_enabled, default_disappear_seconds, silence_unknown_callers,
              notification_prefs
       FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [userId],
    );
    if (!user.rows[0]) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }
    const chats = await query(
      `SELECT c.id, c.is_group, c.name AS group_name, c.created_at
       FROM chat_members cm
       JOIN chats c ON c.id = cm.chat_id
       WHERE cm.user_id = $1
       ORDER BY c.created_at DESC
       LIMIT 500`,
      [userId],
    );
    const sos = await query(
      `SELECT id, contact_name, contact_phone, created_at FROM sos_contacts WHERE user_id = $1`,
      [userId],
    );
    const blocked = await query(
      `SELECT blocked_id, created_at FROM blocked_users WHERE blocker_id = $1`,
      [userId],
    );
    res.json({
      success: true,
      exportedAt: new Date().toISOString(),
      report: {
        profile: user.rows[0],
        chats: chats.rows,
        sosContacts: sos.rows,
        blockedUserIds: blocked.rows.map((r: { blocked_id: number }) => r.blocked_id),
        note: "Message contents are not included in this summary report. Export chat backups from Settings → Chats on your device.",
      },
    });
  } catch (err) {
    req.log.error({ err }, "account export");
    res.status(500).json({ success: false });
  }
});

/** Soft-delete account. Same phone can re-register and restore this user_id (Video channel included). */
router.delete("/:id", async (req: Request, res: Response) => {
  if (!assertSameUser(req, res, req.params.id)) return;
  const userId = Number(req.params.id);
  try {
    await ensureNotificationPrefsColumn();
    const existing = await query(`SELECT id, phone, deleted_at FROM users WHERE id = $1`, [userId]);
    if (!existing.rows[0]) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }
    if (existing.rows[0].deleted_at) {
      res.json({ success: true, alreadyDeleted: true });
      return;
    }
    const originalPhone = String(existing.rows[0].phone ?? "");
    const tombstonePhone = `deleted_${userId}_${Date.now()}`;
    await query(
      `UPDATE users SET
         deleted_phone = $1,
         phone = $2,
         name = 'Deleted User',
         about = NULL,
         avatar_url = NULL,
         push_token = NULL,
         two_step_pin = NULL,
         is_online = FALSE,
         deleted_at = NOW(),
         updated_at = NOW()
       WHERE id = $3`,
      [originalPhone || null, tombstonePhone, userId],
    );
    await query(`DELETE FROM sos_contacts WHERE user_id = $1 OR contact_user_id = $1`, [userId]).catch(() => {});
    await query(`DELETE FROM web_sessions WHERE user_id = $1`, [userId]).catch(() => {});
    await query(`DELETE FROM typing_sessions WHERE user_id = $1`, [userId]).catch(() => {});
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "delete account");
    res.status(500).json({ success: false, message: "Could not delete account." });
  }
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
  if (!assertSameUser(req, res, req.params.id)) return;
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

// Search users by phone (authenticated — prevents open user enumeration)
router.get("/search/:phone", requireAuth, async (req: Request, res: Response) => {
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

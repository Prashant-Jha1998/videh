import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Router, type Request, type Response } from "express";
import multer from "multer";
import { query } from "../lib/db";
import { EXPO_CHAT_MESSAGE_CATEGORY_ID } from "../lib/expoPush";
import { chatMessagePushPreview } from "../lib/chatMessagePreview";
import { resolveChatMessageRowForClient } from "../lib/chatMessageMedia";
import { isValidPushToken, sendChatPush, sendChatPushToMembers } from "../lib/pushNotify";
import { pushNotificationImageUrl } from "../lib/pushMediaUrl";
import { enforceModerationForActivity } from "../lib/moderation";
import { enforceGroupCreationPolicy } from "../lib/groupCreationPolicy";
import { assertSameUser, getAuthUserId, requireAuth } from "../lib/auth";
import { publicMediaUrl, resolveStoredMediaUrl } from "../lib/mediaStorage";
import { tryRedirectStoredMediaToCdn, uploadLocalFileToS3 } from "../lib/s3Storage";
import { auditFromRequest } from "../lib/s3MediaAudit";
import { attachChatEventStream, publishChatEvent } from "../lib/realtime";
import {
  ensureChatMemberHistoryClearedColumn,
  messageAfterHistoryClearedSql,
} from "../lib/chatMemberHistory";
import {
  attachTranslationsForViewer,
  ensureTranslationTables,
  getViewerTranslationPrefs,
  invalidateMessageTranslations,
  LANG_DISPLAY_NAMES,
  normalizeLangCode,
} from "../lib/translationService";
import { messageWithinRetentionSql } from "../lib/messageRetention";
import { ensureMessageUserHidesTable, hideMessageForUser, messageVisibleToUserSql } from "../lib/messageUserHides";
import { getPresenceForViewer } from "../lib/presencePrivacy";
import { canAddUserToGroup, getExtendedPrivacy } from "../lib/userPrivacySettings";
import {
  canSendAfterInviteApproval,
  createGroupInviteLink,
  ensureGroupInviteTables,
} from "../lib/groupInviteLinks";
import {
  deleteChatMediaFile,
  ensureStatusReplyColumn,
  ensureViewOnceColumns,
  mediaFilenameFromUrl,
  userCanAccessChatMedia,
} from "../lib/chatMediaAccess";
import {
  computeMessageExpiresAt,
  ensureDisappearingMessageColumns,
  fetchChatDisappearSeconds,
  messageDisappearVisibleSql,
} from "../lib/disappearingMessages";
import { insertChatSystemMessage } from "../lib/chatSystemMessages";

const router = Router();
const currentFilePath = fileURLToPath(import.meta.url);
const routesDir = path.dirname(currentFilePath);
const apiServerDir = path.resolve(routesDir, "../..");
const chatUploadsDir = path.join(apiServerDir, "uploads", "chats");
fs.mkdirSync(chatUploadsDir, { recursive: true });

function mediaExtension(mime: string): string {
  if (mime === "application/pdf") return ".pdf";
  if (mime === "application/vnd.ms-excel") return ".xls";
  if (mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return ".xlsx";
  if (mime === "application/msword") return ".doc";
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return ".docx";
  if (mime === "video/quicktime") return ".mov";
  if (mime === "video/mp4") return ".mp4";
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  if (mime === "audio/mpeg") return ".mp3";
  if (mime === "audio/mp4") return ".m4a";
  if (mime === "audio/aac") return ".aac";
  if (mime === "application/zip" || mime === "application/x-zip-compressed") return ".zip";
  if (mime === "application/vnd.rar" || mime === "application/x-rar-compressed") return ".rar";
  if (mime === "application/x-7z-compressed") return ".7z";
  if (mime === "text/plain") return ".txt";
  if (mime === "text/csv") return ".csv";
  return mime.startsWith("image/") ? ".jpg" : ".bin";
}

function mimeFromFilename(filename: string, fallback: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".xls") return "application/vnd.ms-excel";
  if (ext === ".xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (ext === ".doc") return "application/msword";
  if (ext === ".docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".mp4" || ext === ".m4v") return "video/mp4";
  if (ext === ".mov") return "video/quicktime";
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".m4a") return "audio/mp4";
  if (ext === ".3gp") return "audio/3gpp";
  if (ext === ".caf") return "audio/x-caf";
  if (ext === ".aac") return "audio/aac";
  if (ext === ".zip") return "application/zip";
  if (ext === ".rar") return "application/vnd.rar";
  if (ext === ".7z") return "application/x-7z-compressed";
  if (ext === ".txt") return "text/plain";
  if (ext === ".csv") return "text/csv";
  return fallback || "application/octet-stream";
}

const chatMediaUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, chatUploadsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "") || mediaExtension(file.mimetype);
      const safeExt = ext.replace(/[^.\w]/g, "") || ".bin";
      cb(null, `${Date.now()}_${crypto.randomBytes(6).toString("hex")}${safeExt}`);
    },
  }),
  limits: { fileSize: 150 * 1024 * 1024 },
});

let chatMediaTableEnsured = false;
async function ensureChatMediaTable(): Promise<void> {
  if (chatMediaTableEnsured) return;
  await query(`
    CREATE TABLE IF NOT EXISTS chat_media_files (
      filename TEXT PRIMARY KEY,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      data BYTEA,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`ALTER TABLE chat_media_files ALTER COLUMN data DROP NOT NULL`).catch(() => {});
  chatMediaTableEnsured = true;
}

let chatMemberArchiveEnsured = false;
async function ensureChatMemberArchiveColumn(): Promise<void> {
  if (chatMemberArchiveEnsured) return;
  await query("ALTER TABLE chat_members ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE");
  chatMemberArchiveEnsured = true;
}

let groupMetadataEnsured = false;
async function ensureGroupMetadataColumns(): Promise<void> {
  if (groupMetadataEnsured) return;
  await query("ALTER TABLE chats ADD COLUMN IF NOT EXISTS group_description TEXT");
  await query("ALTER TABLE chats ADD COLUMN IF NOT EXISTS group_messaging_policy TEXT NOT NULL DEFAULT 'everyone'");
  groupMetadataEnsured = true;
}

type GroupSendEval = {
  ok: boolean;
  code?: "not_member" | "admins_only" | "allowlist" | "pending_approval";
  policy: string;
  isGroup: boolean;
  isAdmin: boolean;
};

async function directChatBlocked(chatId: string | string[], senderId: number): Promise<boolean> {
  const id = Array.isArray(chatId) ? chatId[0] : chatId;
  const r = await query(`
    SELECT EXISTS(
      SELECT 1
      FROM chats c
      JOIN chat_members me ON me.chat_id = c.id AND me.user_id = $2
      JOIN chat_members other ON other.chat_id = c.id AND other.user_id != $2
      JOIN blocked_users b
        ON (b.blocker_id = me.user_id AND b.blocked_id = other.user_id)
        OR (b.blocker_id = other.user_id AND b.blocked_id = me.user_id)
      WHERE c.id = $1 AND c.is_group = FALSE
    ) AS blocked
  `, [id, senderId]);
  return Boolean(r.rows[0]?.blocked);
}

/** Resolves whether a user may post in this chat (direct chats always allowed). */
async function evaluateGroupSendPermission(chatId: string | string[], userId: number): Promise<GroupSendEval | null> {
  const id = Array.isArray(chatId) ? chatId[0] : chatId;
  await ensureGroupMetadataColumns();
  await ensureGroupInviteTables();
    `SELECT c.is_group,
            COALESCE(NULLIF(TRIM(c.group_messaging_policy), ''), 'everyone') AS policy,
            cm.is_admin,
            COALESCE(cm.can_send_messages, TRUE) AS can_send_messages,
            COALESCE(cm.join_pending_approval, FALSE) AS join_pending_approval
     FROM chats c
     INNER JOIN chat_members cm ON cm.chat_id = c.id AND cm.user_id = $2
     WHERE c.id = $1`,
    [id, userId],
  );
  if (r.rows.length === 0) return null;
  const row = r.rows[0];
  const policy = String(row.policy || "everyone");
  const isGroup = !!row.is_group;
  const isAdmin = !!row.is_admin;
  const canSendFlag = !!row.can_send_messages;
  const pendingApproval = !!row.join_pending_approval;
  if (!isGroup) return { ok: true, policy: "everyone", isGroup: false, isAdmin: false };
  if (pendingApproval && !isAdmin) {
    return { ok: false, code: "pending_approval", policy, isGroup: true, isAdmin };
  }
  if (policy === "everyone") return { ok: true, policy, isGroup: true, isAdmin };
  if (policy === "admins_only") {
    return isAdmin
      ? { ok: true, policy, isGroup: true, isAdmin }
      : { ok: false, code: "admins_only", policy, isGroup: true, isAdmin };
  }
  if (policy === "allowlist") {
    return isAdmin || canSendFlag
      ? { ok: true, policy, isGroup: true, isAdmin }
      : { ok: false, code: "allowlist", policy, isGroup: true, isAdmin };
  }
  return { ok: true, policy, isGroup: true, isAdmin };
}

/** Whether a newly added member may send (allowlist requires admin approval). */
function memberCanSendOnJoin(policy: string): boolean {
  return policy !== "allowlist";
}

// Get all chats for a user
router.get("/user/:userId", async (req: Request, res: Response) => {
  const { userId } = req.params;
  if (!assertSameUser(req, res, userId)) return;
  try {
    await ensureChatMemberArchiveColumn();
    await ensureChatMemberHistoryClearedColumn();
    await ensureMessageUserHidesTable();
    const historySql = messageAfterHistoryClearedSql("cm");
    const retentionSql = messageWithinRetentionSql("m");
    const result = await query(`
      SELECT
        c.id,
        c.is_group,
        c.group_name,
        c.group_avatar_url,
        c.group_description,
        c.disappear_after_seconds,
        COALESCE(c.auto_translate_enabled, FALSE) AS auto_translate_enabled,
        cm.is_muted,
        cm.is_pinned,
        cm.is_archived,
        cm.last_read_at,
        cm.history_cleared_at,
        last_msg.last_message,
        COALESCE(unread.unread_count, 0) AS unread_count,
        COALESCE(other_members.members, '[]'::json) AS other_members,
        cm.joined_at AS member_joined_at
      FROM chats c
      JOIN chat_members cm ON cm.chat_id = c.id AND cm.user_id = $1::int
      LEFT JOIN LATERAL (
        SELECT json_build_object(
          'id', m.id,
          'content', m.content,
          'type', m.type,
          'media_url', m.media_url,
          'sender_id', m.sender_id,
          'created_at', m.created_at,
          'is_deleted', m.is_deleted
        ) AS last_message,
        m.created_at AS last_created_at
        FROM messages m
        WHERE m.chat_id = c.id AND m.type != 'system' AND ${messageVisibleToUserSql("$1")}
          AND ${messageDisappearVisibleSql()}
          AND ${historySql}
          AND ${retentionSql}
        ORDER BY m.created_at DESC
        LIMIT 1
      ) last_msg ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS unread_count
        FROM messages m
        WHERE m.chat_id = c.id
          AND m.sender_id != $1::int
          AND m.type != 'system'
          AND m.created_at > cm.last_read_at
          AND ${messageVisibleToUserSql("$1")}
          AND ${messageDisappearVisibleSql()}
          AND ${historySql}
          AND ${retentionSql}
      ) unread ON TRUE
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object(
            'id', u.id, 'name', u.name, 'phone', u.phone,
            'avatar_url', u.avatar_url, 'is_online', u.is_online, 'last_seen', u.last_seen
          )) AS members
        FROM chat_members cm2
        JOIN users u ON u.id = cm2.user_id
        WHERE cm2.chat_id = c.id AND cm2.user_id != $1::int
      ) other_members ON TRUE
      WHERE last_msg.last_message IS NOT NULL OR c.is_group = TRUE
      ORDER BY COALESCE(last_msg.last_created_at, cm.joined_at) DESC NULLS LAST
    `, [userId]);

    const viewerId = Number(userId);
    const chats = result.rows;
    const { lookupBusinessChannelByUserId } = await import("../lib/businessChannelLookup");
    for (const chat of chats) {
      if (chat.is_group || !chat.other_members?.[0]) continue;
      const other = chat.other_members[0];
      const presence = await getPresenceForViewer(viewerId, Number(other.id));
      other.is_online = presence.canSee && presence.isOnline;
      other.last_seen = presence.canSee ? presence.lastSeen : null;
      const business = await lookupBusinessChannelByUserId(Number(other.id));
      if (business) {
        if (business.logoUrl) other.avatar_url = business.logoUrl;
        if (business.displayName?.trim()) other.name = business.displayName.trim();
      }
    }

    res.json({ success: true, chats });
  } catch (err) {
    req.log.error({ err }, "get chats error");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/user/:userId/events", (req: Request, res: Response) => {
  const userId = Number(req.params.userId);
  if (!assertSameUser(req, res, userId)) return;
  const detach = attachChatEventStream(userId, res);
  req.on("close", detach);
});

/** Clear all chat history for this user (delete from chat list — messages stay hidden until new ones arrive). */
router.post("/:chatId/clear-history", async (req: Request, res: Response) => {
  const { chatId } = req.params;
  const { userId } = req.body as { userId?: number };
  if (!userId) {
    res.status(400).json({ success: false, message: "userId required" });
    return;
  }
  if (!assertSameUser(req, res, userId)) return;
  try {
    await ensureChatMemberHistoryClearedColumn();
    const member = await query(
      "SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2",
      [chatId, userId],
    );
    if (member.rows.length === 0) {
      res.status(403).json({ success: false, message: "Not a member of this chat" });
      return;
    }
    const updated = await query(
      `UPDATE chat_members
       SET history_cleared_at = NOW(), last_read_at = NOW()
       WHERE chat_id = $1 AND user_id = $2
       RETURNING history_cleared_at`,
      [chatId, userId],
    );
    res.json({
      success: true,
      clearedAt: updated.rows[0]?.history_cleared_at ?? new Date().toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "clear chat history error");
    res.status(500).json({ success: false, message: "Could not clear chat history" });
  }
});

router.patch("/:chatId/archive", async (req: Request, res: Response) => {
  const { chatId } = req.params;
  const { userId, archived } = req.body as { userId?: number; archived?: boolean };
  if (!userId) {
    res.status(400).json({ success: false, message: "userId is required" });
    return;
  }
  if (!assertSameUser(req, res, userId)) return;
  try {
    await ensureChatMemberArchiveColumn();
    const r = await query(
      `UPDATE chat_members
       SET is_archived = $3
       WHERE chat_id = $1 AND user_id = $2
       RETURNING is_archived`,
      [chatId, userId, Boolean(archived)],
    );
    if (!r.rows[0]) {
      res.status(404).json({ success: false, message: "Chat membership not found" });
      return;
    }
    res.json({ success: true, isArchived: r.rows[0].is_archived });
  } catch (err) {
    req.log.error({ err }, "archive chat error");
    res.status(500).json({ success: false, message: "Could not update archive state" });
  }
});

// Get or create a direct chat between two users
router.post("/direct", async (req: Request, res: Response) => {
  const { userId, otherUserId } = req.body as { userId?: number; otherUserId?: number };
  if (!userId || !otherUserId) { res.status(400).json({ success: false }); return; }
  if (!assertSameUser(req, res, userId)) return;
  try {
    const block = await query(`
      SELECT EXISTS(
        SELECT 1 FROM blocked_users
        WHERE (blocker_id = $1 AND blocked_id = $2)
           OR (blocker_id = $2 AND blocked_id = $1)
      ) AS blocked
    `, [userId, otherUserId]);
    if (block.rows[0]?.blocked) {
      res.status(403).json({ success: false, code: "blocked", message: "You cannot start a chat with this contact." });
      return;
    }

    const existing = await query(`
      SELECT c.id FROM chats c
      JOIN chat_members cm1 ON cm1.chat_id = c.id AND cm1.user_id = $1
      JOIN chat_members cm2 ON cm2.chat_id = c.id AND cm2.user_id = $2
      WHERE c.is_group = FALSE
      LIMIT 1
    `, [userId, otherUserId]);

    if (existing.rows.length > 0) {
      res.json({ success: true, chatId: existing.rows[0].id });
      return;
    }

    const chat = await query(
      "INSERT INTO chats (is_group, disappear_after_seconds) VALUES (FALSE, NULL) RETURNING id",
      [],
    );
    const chatId = chat.rows[0].id;
    await query("INSERT INTO chat_members (chat_id, user_id) VALUES ($1, $2), ($1, $3)", [chatId, userId, otherUserId]);
    res.json({ success: true, chatId });
  } catch (err) {
    req.log.error({ err }, "direct chat error");
    res.status(500).json({ success: false });
  }
});

// Create group chat
router.post("/group", async (req: Request, res: Response) => {
  const { creatorId, name, memberIds, groupAvatarUrl, description } = req.body as {
    creatorId?: number;
    name?: string;
    memberIds?: number[];
    groupAvatarUrl?: string | null;
    description?: string | null;
  };
  if (!creatorId || !name || !memberIds?.length) {
    res.status(400).json({ success: false, message: "creatorId, name and memberIds are required" });
    return;
  }
  if (!assertSameUser(req, res, creatorId)) return;
  const trimmedName = name.trim();
  if (trimmedName.length < 3) {
    res.status(400).json({ success: false, message: "Group name must be at least 3 characters" });
    return;
  }
  if (memberIds.length > 1023) {
    res.status(400).json({ success: false, message: "Group member limit exceeded" });
    return;
  }
  try {
    await ensureGroupMetadataColumns();
    const policy = await enforceGroupCreationPolicy(creatorId);
    if (!policy.allowed) {
      res.status(403).json({
        success: false,
        code: policy.code,
        message: policy.message,
        suspendedUntil: policy.suspendedUntil ?? null,
        alert: policy.alert,
        strikeCount: policy.strikeCount,
      });
      return;
    }

    const chat = await query(
      "INSERT INTO chats (is_group, group_name, group_avatar_url, group_description, created_by, auto_translate_enabled) VALUES (TRUE, $1, $2, $3, $4, TRUE) RETURNING id",
      [trimmedName, groupAvatarUrl ?? null, description ?? null, creatorId]
    );
    const chatId = chat.rows[0].id;
    const allMembers = Array.from(new Set([creatorId, ...memberIds]));
    for (const memberId of allMembers) {
      if (memberId !== creatorId) {
        const allowed = await canAddUserToGroup(creatorId, memberId);
        if (!allowed) {
          res.status(403).json({
            success: false,
            message: "One or more people cannot be added to groups based on their privacy settings.",
          });
          return;
        }
      }
      await query(
        "INSERT INTO chat_members (chat_id, user_id, is_admin, can_send_messages) VALUES ($1, $2, $3, TRUE)",
        [chatId, memberId, memberId === creatorId],
      );
    }
    res.json({ success: true, chatId });
  } catch (err) {
    req.log.error({ err }, "create group error");
    res.status(500).json({ success: false });
  }
});

router.get("/media/:filename", requireAuth, async (req: Request, res: Response) => {
  try {
    await ensureChatMediaTable();
    const userId = getAuthUserId(req);
    if (!userId) {
      res.status(401).json({ success: false, message: "Sign in required." });
      return;
    }
    const rawFilename = Array.isArray(req.params.filename) ? req.params.filename[0] : req.params.filename;
    const filename = path.basename(rawFilename ?? "");
    const allowed = await userCanAccessChatMedia(userId, filename);
    if (!allowed) {
      res.status(403).json({ success: false, message: "Media access denied." });
      return;
    }
    const uploadsRel = `/uploads/chats/${filename}`;
    if (tryRedirectStoredMediaToCdn(req, res, uploadsRel)) return;

    const diskPath = path.join(chatUploadsDir, filename);
    if (fs.existsSync(diskPath)) {
      const stat = fs.statSync(diskPath);
      const mimeType = mimeFromFilename(filename);
      res.setHeader("Content-Type", mimeType);
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.setHeader("Content-Length", String(stat.size));
      fs.createReadStream(diskPath).pipe(res);
      return;
    }

    const result = await query(
      "SELECT filename, mime_type, size_bytes, data FROM chat_media_files WHERE filename = $1",
      [filename],
    );
    const row = result.rows[0] as { filename: string; mime_type: string; size_bytes: number; data: Buffer | null } | undefined;
    if (!row || !row.data) {
      res.status(404).json({ success: false, message: "Media not found." });
      return;
    }

    const data = row.data;
    const size = Number(row.size_bytes) || data.length;
    const mimeType = mimeFromFilename(row.filename, row.mime_type);
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

    const range = req.headers.range;
    if (range) {
      const match = range.match(/bytes=(\d*)-(\d*)/);
      const start = match?.[1] ? Number(match[1]) : 0;
      const requestedEnd = match?.[2] ? Number(match[2]) : size - 1;
      const end = Math.min(requestedEnd, size - 1);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
        res.status(416).setHeader("Content-Range", `bytes */${size}`).end();
        return;
      }
      res.status(206);
      res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
      res.setHeader("Content-Length", String(end - start + 1));
      res.end(data.subarray(start, end + 1));
      return;
    }

    res.setHeader("Content-Length", String(size));
    res.end(data);
  } catch (err) {
    req.log.error({ err }, "chat media read error");
    res.status(500).json({ success: false });
  }
});

router.post("/media", requireAuth, chatMediaUpload.single("file"), async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ success: false, message: "file is required" });
    return;
  }
  try {
    await ensureChatMediaTable();
    const mimeType = mimeFromFilename(req.file.filename, req.file.mimetype);
    const uploadsRel = `/uploads/chats/${req.file.filename}`;
    const userId = getAuthUserId(req);
    await uploadLocalFileToS3(req.file.path, uploadsRel, auditFromRequest(req, {
      sourceApp: "chat",
      sourceContext: "message_attachment",
      uploaderType: "user",
      uploaderUserId: userId,
      originalFilename: req.file.originalname,
      metadata: { filename: req.file.filename },
    }));
    await query(
      `INSERT INTO chat_media_files (filename, mime_type, size_bytes, data)
       VALUES ($1, $2, $3, NULL)
       ON CONFLICT (filename)
       DO UPDATE SET mime_type = EXCLUDED.mime_type, size_bytes = EXCLUDED.size_bytes`,
      [req.file.filename, mimeType, req.file.size],
    );

    const publicUrl =
      resolveStoredMediaUrl(req, uploadsRel)
      ?? publicMediaUrl(req, `/api/chats/media/${encodeURIComponent(req.file.filename)}`);
    res.json({
      success: true,
      url: publicUrl,
      mimeType,
      size: req.file.size,
    });
  } catch (err) {
    req.log.error({ err }, "chat media upload error");
    await fs.promises.unlink(req.file.path).catch(() => {});
    res.status(500).json({ success: false, message: "Could not save chat media." });
  }
});

// Get messages in a chat (with read status, reactions, forward_count)
router.get("/:chatId/messages", async (req: Request, res: Response) => {
  const { chatId } = req.params;
  const userId = req.query.userId as string | undefined;
  const limit = Number(req.query.limit ?? 50);
  const before = req.query.before as string | undefined;
  if (!assertSameUser(req, res, userId)) return;
  try {
    await ensureMessageUserHidesTable();
    await ensureChatMemberHistoryClearedColumn();
    await ensureViewOnceColumns();
    await ensureDisappearingMessageColumns();
    await ensureStatusReplyColumn();
    const viewerId = Number(userId);
    const viewerParam = before ? "$4" : "$3";
    const historySql = messageAfterHistoryClearedSql("cm");
    const retentionSql = messageWithinRetentionSql("m");
    const result = await query(`
      SELECT
        m.id, m.chat_id, m.sender_id, m.content, m.type,
        CASE
          WHEN m.is_view_once AND m.view_once_opened_at IS NOT NULL THEN NULL
          ELSE m.media_url
        END AS media_url,
        m.reply_to_id, m.is_deleted, m.is_forwarded, m.forward_count,
        m.is_starred, m.is_view_once, m.view_once_opened_at, m.edited_at, m.created_at,
        m.expires_at, m.is_kept, m.status_reply_id,
        u.name AS sender_name, u.avatar_url AS sender_avatar,
        rm.content AS reply_content,
        rm.type AS reply_type,
        rm.sender_id AS reply_sender_id,
        rm.is_deleted AS reply_is_deleted,
        rm_u.name AS reply_sender_name,
        sr.content AS status_reply_content,
        sr.type AS status_reply_type,
        sr.media_url AS status_reply_media_url,
        sr.background_color AS status_reply_background_color,
        sr.user_id AS status_reply_owner_id,
        sr_u.name AS status_reply_owner_name,
        (
          SELECT json_agg(json_build_object('emoji', r.emoji, 'user_id', r.user_id))
          FROM message_reactions r WHERE r.message_id = m.id
        ) AS reactions,
        (
          SELECT ms.status FROM message_status ms
          WHERE ms.message_id = m.id AND ms.user_id != m.sender_id
          ORDER BY CASE ms.status WHEN 'read' THEN 0 WHEN 'delivered' THEN 1 ELSE 2 END
          LIMIT 1
        ) AS delivery_status
      FROM messages m
      JOIN chat_members cm ON cm.chat_id = m.chat_id AND cm.user_id = ${viewerParam}::int
      LEFT JOIN users u ON u.id = m.sender_id
      LEFT JOIN messages rm ON rm.id = m.reply_to_id
      LEFT JOIN users rm_u ON rm_u.id = rm.sender_id
      LEFT JOIN statuses sr ON sr.id = m.status_reply_id
      LEFT JOIN users sr_u ON sr_u.id = sr.user_id
      WHERE m.chat_id = $1
        AND ${messageVisibleToUserSql(viewerParam)}
        AND ${messageDisappearVisibleSql()}
        AND ${historySql}
        AND ${retentionSql}
        ${before ? "AND m.created_at < $3" : ""}
      ORDER BY m.created_at DESC
      LIMIT $2
    `, before ? [chatId, limit, before, viewerId] : [chatId, limit, viewerId]);

    const messages = result.rows
      .reverse();
    const skipTranslate =
      req.query.skipTranslate === "1"
      || req.query.fast === "1";
    await ensureTranslationTables();
    const withTranslations = skipTranslate
      ? messages
      : await attachTranslationsForViewer(
        chatId,
        viewerId,
        messages as Array<Record<string, unknown> & { id: number }>,
      );
    res.json({
      success: true,
      messages: withTranslations.map((row) => resolveChatMessageRowForClient(req, row as Record<string, unknown>)),
    });
  } catch (err) {
    req.log.error({ err }, "get messages error");
    res.status(500).json({ success: false });
  }
});

/** POST /api/chats/:chatId/messages/:messageId/consume-view-once — open view-once media once (recipient). */
router.post("/:chatId/messages/:messageId/consume-view-once", async (req: Request, res: Response) => {
  const chatId = Number(req.params.chatId);
  const messageId = Number(req.params.messageId);
  const { userId } = req.body as { userId?: number };
  if (!chatId || !messageId || !userId) {
    res.status(400).json({ success: false, message: "Invalid request" });
    return;
  }
  if (!assertSameUser(req, res, userId)) return;
  try {
    await ensureViewOnceColumns();
    const row = await query(
      `SELECT m.id, m.sender_id, m.media_url, m.is_view_once, m.view_once_opened_at
       FROM messages m
       JOIN chat_members cm ON cm.chat_id = m.chat_id AND cm.user_id = $2
       WHERE m.id = $1 AND m.chat_id = $3 AND m.is_deleted = false`,
      [messageId, userId, chatId],
    );
    const msg = row.rows[0] as {
      sender_id: number;
      media_url: string | null;
      is_view_once: boolean;
      view_once_opened_at: string | null;
    } | undefined;
    if (!msg) {
      res.status(404).json({ success: false, message: "Message not found" });
      return;
    }
    if (!msg.is_view_once || !msg.media_url) {
      res.status(400).json({ success: false, message: "Not a view-once message" });
      return;
    }
    if (Number(msg.sender_id) === Number(userId)) {
      res.status(400).json({ success: false, message: "Sender cannot consume own view-once message" });
      return;
    }
    if (msg.view_once_opened_at) {
      res.status(410).json({ success: false, message: "Already opened", mediaUrl: null });
      return;
    }
    const filename = mediaFilenameFromUrl(msg.media_url);
    await query(
      `UPDATE messages SET view_once_opened_at = NOW(), view_once_opened_by = $1, media_url = NULL WHERE id = $2`,
      [userId, messageId],
    );
    if (filename) await deleteChatMediaFile(filename);
    const memberRes = await query("SELECT user_id FROM chat_members WHERE chat_id = $1", [chatId]);
    publishChatEvent({
      type: "message",
      chatId: String(chatId),
      userIds: memberRes.rows.map((r: { user_id: number }) => r.user_id),
      payload: { messageId: String(messageId), action: "view_once_opened" },
    });
    res.json({ success: true, mediaUrl: msg.media_url });
  } catch (err) {
    req.log.error({ err }, "consume view once");
    res.status(500).json({ success: false, message: "Could not open message" });
  }
});

// Typing indicator – set
router.post("/:chatId/typing", async (req: Request, res: Response) => {
  const { chatId } = req.params;
  const { userId } = req.body as { userId?: number };
  if (!userId) { res.status(400).json({ success: false }); return; }
  if (!assertSameUser(req, res, userId)) return;
  try {
    await query(
      `INSERT INTO typing_sessions (chat_id, user_id, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (chat_id, user_id) DO UPDATE SET updated_at = NOW()`,
      [chatId, userId]
    );
    const memberRes = await query("SELECT user_id FROM chat_members WHERE chat_id = $1", [chatId]);
    const nameRes = await query("SELECT name FROM users WHERE id = $1", [userId]);
    publishChatEvent({
      type: "typing",
      chatId: String(chatId),
      userIds: memberRes.rows.map((r: { user_id: number }) => r.user_id),
      payload: { userId, active: true, name: nameRes.rows[0]?.name ?? "Someone" },
    });
    res.json({ success: true });
  } catch { res.json({ success: false }); }
});

// Typing indicator – clear
router.delete("/:chatId/typing", async (req: Request, res: Response) => {
  const { chatId } = req.params;
  const { userId } = req.body as { userId?: number };
  if (!userId) { res.json({ success: false }); return; }
  if (!assertSameUser(req, res, userId)) return;
  try {
    await query("DELETE FROM typing_sessions WHERE chat_id = $1 AND user_id = $2", [chatId, userId]);
    const memberRes = await query("SELECT user_id FROM chat_members WHERE chat_id = $1", [chatId]);
    const nameRes = await query("SELECT name FROM users WHERE id = $1", [userId]);
    publishChatEvent({
      type: "typing",
      chatId: String(chatId),
      userIds: memberRes.rows.map((r: { user_id: number }) => r.user_id),
      payload: { userId, active: false, name: nameRes.rows[0]?.name ?? "Someone" },
    });
    res.json({ success: true });
  } catch { res.json({ success: false }); }
});

// Typing indicator – get
router.get("/:chatId/typing", async (req: Request, res: Response) => {
  const { chatId } = req.params;
  const { userId } = req.query as { userId?: string };
  if (!assertSameUser(req, res, userId)) return;
  try {
    const result = await query(
      `SELECT u.name FROM typing_sessions ts JOIN users u ON u.id = ts.user_id
       WHERE ts.chat_id = $1 AND ts.user_id != $2 AND ts.updated_at > NOW() - INTERVAL '4 seconds'`,
      [chatId, userId ?? 0]
    );
    res.json({ success: true, typing: result.rows.map((r: any) => r.name) });
  } catch { res.json({ success: true, typing: [] }); }
});

// Who may send messages in this chat (for group policy UI)
router.get("/:chatId/messaging-permission", async (req: Request, res: Response) => {
  const { chatId } = req.params;
  const userId = Number(req.query.userId);
  if (!userId) {
    res.status(400).json({ success: false });
    return;
  }
  if (!assertSameUser(req, res, userId)) return;
  try {
    const perm = await evaluateGroupSendPermission(chatId, userId);
    if (!perm) {
      res.status(404).json({ success: false });
      return;
    }
    res.json({
      success: true,
      policy: perm.code === "pending_approval" ? "pending_approval" : perm.policy,
      canSendMessages: perm.ok,
      isAdmin: perm.isAdmin,
    });
  } catch (err) {
    req.log.error({ err }, "messaging-permission");
    res.status(500).json({ success: false });
  }
});

// Send message
router.post("/:chatId/messages", async (req: Request, res: Response) => {
  const { chatId } = req.params;
  const { senderId, content, type, replyToId, mediaUrl, isForwarded, forwardCount, isViewOnce, statusReplyId } = req.body as {
    senderId?: number; content?: string; type?: string; replyToId?: number;
    mediaUrl?: string; isForwarded?: boolean; forwardCount?: number; isViewOnce?: boolean;
    statusReplyId?: number;
  };
  if (!senderId || !content) { res.status(400).json({ success: false }); return; }
  if (!assertSameUser(req, res, senderId)) return;
  if (isForwarded) {
    res.status(400).json({
      success: false,
      message: "Use POST /chats/:chatId/messages/:messageId/forward to forward inside Videh only.",
    });
    return;
  }
  try {
    await ensureDisappearingMessageColumns();
    await ensureStatusReplyColumn();
    const activityType = type === "video" ? "video_share" : type === "contact" ? "contact_share" : "chat_message";
    const mod = await enforceModerationForActivity(senderId, activityType, {
      content,
      mediaUrl: mediaUrl ?? null,
      type: type ?? "text",
    });
    if (!mod.allowed) {
      res.status(403).json({
        success: false,
        code: mod.code,
        message: mod.message,
        suspendedUntil: mod.suspendedUntil ?? null,
        alert: mod.alert,
        strikeCount: mod.strikeCount,
      });
      return;
    }

    const perm = await evaluateGroupSendPermission(chatId, senderId);
    if (!perm) {
      res.status(403).json({
        success: false,
        code: "not_member",
        message: "You are not a member of this chat.",
      });
      return;
    }
    if (!perm.ok) {
      const message =
        perm.code === "admins_only"
          ? "Only group admins can send messages in this group."
          : "You do not have permission to send messages. Ask a group admin to allow you.";
      res.status(403).json({ success: false, code: perm.code, message });
      return;
    }
    if (!perm.isGroup && await directChatBlocked(chatId, senderId)) {
      res.status(403).json({
        success: false,
        code: "blocked",
        message: "You cannot send messages to this contact.",
      });
      return;
    }

    if (String(type ?? "").toLowerCase() === "album") {
      let albumUrlCount = 0;
      try {
        const parsed = JSON.parse(String(content ?? "")) as { urls?: unknown[] };
        albumUrlCount = Array.isArray(parsed.urls) ? parsed.urls.length : 0;
      } catch { /* ignore */ }
      req.log.info(
        { chatId, senderId, albumUrlCount, contentBytes: String(content ?? "").length, mediaUrl },
        "album message db write",
      );
    }

    const messageType = type ?? "text";
    const recentDuplicate = await query(
      `SELECT *
       FROM messages
       WHERE chat_id = $1
         AND sender_id = $2
         AND content = $3
         AND COALESCE(type, 'text') = $4
         AND COALESCE(is_deleted, FALSE) = FALSE
         AND created_at > NOW() - INTERVAL '45 seconds'
       ORDER BY id DESC
       LIMIT 1`,
      [chatId, senderId, content, messageType],
    );
    if (recentDuplicate.rows[0]) {
      const existing = recentDuplicate.rows[0];
      res.json({
        success: true,
        message: resolveChatMessageRowForClient(req, existing as Record<string, unknown>),
        deduplicated: true,
      });
      return;
    }

    const result = await query(`
      INSERT INTO messages (chat_id, sender_id, content, type, reply_to_id, media_url, is_forwarded, forward_count, is_view_once, expires_at, status_reply_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [chatId, senderId, content, type ?? "text", replyToId ?? null, mediaUrl ?? null,
        isForwarded ?? false, forwardCount ?? 0, isViewOnce ?? false,
        computeMessageExpiresAt(await fetchChatDisappearSeconds(chatId), type ?? "text"),
        statusReplyId ?? null]);

    // Mark as delivered for all other members + gather push tokens
    const members = await query(
      `SELECT u.id AS user_id, u.push_token, u.name, cm.is_muted
       FROM chat_members cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.chat_id = $1 AND cm.user_id != $2`,
      [chatId, senderId]
    );
    const recipientIds = members.rows.map((member: any) => Number(member.user_id)).filter(Boolean);
    if (recipientIds.length > 0) {
      await query(
        `INSERT INTO message_status (message_id, user_id, status)
         SELECT $1, unnest($2::int[]), 'delivered'
         ON CONFLICT (message_id, user_id)
         DO UPDATE SET status = 'delivered', updated_at = NOW()`,
        [result.rows[0].id, recipientIds],
      );
    }

    const senderRow = await query("SELECT name, avatar_url FROM users WHERE id = $1", [senderId]);
    const senderName = senderRow.rows[0]?.name ?? "Videh";
    const senderAvatarUrl = pushNotificationImageUrl(senderRow.rows[0]?.avatar_url);
    const notifyMembers = members.rows.filter((m: any) => !m.is_muted);

    publishChatEvent({
      type: "message",
      chatId: Array.isArray(chatId) ? chatId[0] ?? "" : chatId,
      userIds: [senderId, ...recipientIds],
      payload: {
        messageId: result.rows[0].id,
        content: content ?? "",
        type: type ?? "text",
        mediaUrl: mediaUrl ?? result.rows[0].media_url ?? undefined,
        senderId,
        senderName,
      },
    });

    res.json({
      success: true,
      message: resolveChatMessageRowForClient(req, result.rows[0] as Record<string, unknown>),
    });

    if (notifyMembers.length > 0) {
      const preview = chatMessagePushPreview(type ?? "text", content ?? "");
      void sendChatPushToMembers(
        notifyMembers.map((m: any) => ({
          user_id: Number(m.user_id),
          push_token: m.push_token,
        })),
        senderName,
        preview,
        {
          chatId: String(chatId),
          messageId: String(result.rows[0].id),
          senderId: String(senderId),
          senderName,
          senderAvatarUrl: senderAvatarUrl ?? "",
          messageType: type ?? "text",
          mediaUrl: String(mediaUrl ?? result.rows[0].media_url ?? ""),
          type: "message",
          notificationKind: "chat_message",
          isGroup: perm.isGroup ? "1" : "0",
        },
        {
          isGroup: perm.isGroup,
          categoryId: EXPO_CHAT_MESSAGE_CATEGORY_ID,
          threadId: `chat-${chatId}`,
          imageUrl: senderAvatarUrl,
          chatId: String(chatId),
        },
      ).catch((err: unknown) => {
        req.log.warn({ err, chatId, messageId: result.rows[0].id }, "chat push dispatch failed");
      });
    }
  } catch (err) {
    req.log.error({ err }, "send message error");
    res.status(500).json({ success: false });
  }
});

/** Forward message to another Videh chat only (no external apps). */
router.post("/:chatId/messages/:messageId/forward", async (req: Request, res: Response) => {
  const { chatId: sourceChatId, messageId } = req.params;
  const { senderId, targetChatId } = req.body as { senderId?: number; targetChatId?: number | string };
  if (!senderId || !targetChatId) {
    res.status(400).json({ success: false, message: "senderId and targetChatId required" });
    return;
  }
  if (!assertSameUser(req, res, senderId)) return;
  const targetId = String(targetChatId);
  if (targetId === String(sourceChatId)) {
    res.status(400).json({ success: false, message: "Choose a different Videh chat to forward to." });
    return;
  }

  try {
    await ensureDisappearingMessageColumns();
    const sourcePerm = await evaluateGroupSendPermission(sourceChatId, senderId);
    const targetPerm = await evaluateGroupSendPermission(targetId, senderId);
    if (!sourcePerm || !targetPerm) {
      res.status(403).json({ success: false, message: "You are not a member of one of these chats." });
      return;
    }
    if (!targetPerm.ok) {
      res.status(403).json({
        success: false,
        message: targetPerm.code === "admins_only"
          ? "Only group admins can send messages in that group."
          : "You cannot forward to that group.",
      });
      return;
    }
    if (!targetPerm.isGroup && await directChatBlocked(targetId, senderId)) {
      res.status(403).json({ success: false, message: "You cannot forward to this contact." });
      return;
    }

    const src = await query(
      `SELECT id, content, type, media_url, is_deleted, is_view_once, forward_count
       FROM messages WHERE id = $1 AND chat_id = $2`,
      [messageId, sourceChatId],
    );
    const original = src.rows[0];
    if (!original) {
      res.status(404).json({ success: false, message: "Message not found" });
      return;
    }
    if (original.is_deleted) {
      res.status(400).json({ success: false, message: "Deleted messages cannot be forwarded." });
      return;
    }
    if (original.is_view_once) {
      res.status(400).json({ success: false, message: "View-once messages cannot be forwarded." });
      return;
    }

    const newForwardCount = Number(original.forward_count ?? 0) + 1;
    const content = String(original.content ?? "");
    const messageType = String(original.type ?? "text");
    const mediaUrl = original.media_url ?? null;

    const mod = await enforceModerationForActivity(senderId, "chat_message", {
      content,
      mediaUrl,
      type: messageType,
    });
    if (!mod.allowed) {
      res.status(403).json({
        success: false,
        code: mod.code,
        message: mod.message,
        suspendedUntil: mod.suspendedUntil ?? null,
        alert: mod.alert,
        strikeCount: mod.strikeCount,
      });
      return;
    }

    const result = await query(
      `INSERT INTO messages (chat_id, sender_id, content, type, reply_to_id, media_url, is_forwarded, forward_count, is_view_once, expires_at)
       VALUES ($1, $2, $3, $4, NULL, $5, TRUE, $6, FALSE, $7)
       RETURNING *`,
      [
        targetId,
        senderId,
        content,
        messageType,
        mediaUrl,
        newForwardCount,
        computeMessageExpiresAt(await fetchChatDisappearSeconds(targetId), messageType),
      ],
    );

    const members = await query(
      `SELECT u.id AS user_id, u.push_token, u.name, cm.is_muted
       FROM chat_members cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.chat_id = $1 AND cm.user_id != $2`,
      [targetId, senderId],
    );
    const recipientIds = members.rows.map((member: { user_id: number }) => Number(member.user_id)).filter(Boolean);
    if (recipientIds.length > 0) {
      await query(
        `INSERT INTO message_status (message_id, user_id, status)
         SELECT $1, unnest($2::int[]), 'delivered'
         ON CONFLICT (message_id, user_id)
         DO UPDATE SET status = 'delivered', updated_at = NOW()`,
        [result.rows[0].id, recipientIds],
      );
    }

    const senderRow = await query("SELECT name, avatar_url FROM users WHERE id = $1", [senderId]);
    const senderName = senderRow.rows[0]?.name ?? "Videh";
    const senderAvatarUrl = pushNotificationImageUrl(senderRow.rows[0]?.avatar_url);
    const notifyMembers = members.rows.filter((m: { is_muted: boolean }) => !m.is_muted);

    publishChatEvent({
      type: "message",
      chatId: targetId,
      userIds: [senderId, ...recipientIds],
      payload: { messageId: result.rows[0].id },
    });

    res.json({ success: true, message: result.rows[0], targetChatId: targetId });

    if (notifyMembers.length > 0) {
      const targetIsGroup = await query("SELECT is_group FROM chats WHERE id = $1", [targetId]);
      const isGroup = Boolean(targetIsGroup.rows[0]?.is_group);
      const preview = chatMessagePushPreview(messageType, content) || "Forwarded message";
      void sendChatPushToMembers(
        notifyMembers.map((m: { user_id: number; push_token: string | null }) => ({
          user_id: Number(m.user_id),
          push_token: m.push_token,
        })),
        senderName,
        preview,
        {
          chatId: targetId,
          messageId: String(result.rows[0].id),
          senderId: String(senderId),
          senderName,
          senderAvatarUrl: senderAvatarUrl ?? "",
          messageType,
          type: "message",
          notificationKind: "chat_message",
          isGroup: isGroup ? "1" : "0",
        },
        {
          isGroup,
          categoryId: EXPO_CHAT_MESSAGE_CATEGORY_ID,
          threadId: `chat-${targetId}`,
          imageUrl: senderAvatarUrl,
          chatId: targetId,
        },
      ).catch((err: unknown) => {
        req.log.warn({ err, chatId: targetId, messageId: result.rows[0].id }, "forward push dispatch failed");
      });
    }
  } catch (err) {
    req.log.error({ err }, "forward message error");
    res.status(500).json({ success: false });
  }
});

// Delete message (for me OR for everyone)
router.delete("/:chatId/messages/:messageId", async (req: Request, res: Response) => {
  const { chatId, messageId } = req.params;
  const { userId, deleteForEveryone } = req.body as { userId?: number; deleteForEveryone?: boolean };
  if (!userId || !assertSameUser(req, res, userId)) return;
  try {
    const member = await query(
      `SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2`,
      [chatId, userId],
    );
    if (!member.rows.length) {
      res.status(403).json({ success: false, message: "Not a member of this chat" });
      return;
    }

    const msgRow = await query(`SELECT sender_id, chat_id FROM messages WHERE id = $1`, [messageId]);
    const msg = msgRow.rows[0] as { sender_id: number; chat_id: number } | undefined;
    if (!msg || String(msg.chat_id) !== String(chatId)) {
      res.status(404).json({ success: false, message: "Message not found" });
      return;
    }

    const isSender = Number(msg.sender_id) === Number(userId);
    if (deleteForEveryone && isSender) {
      await query(
        "UPDATE messages SET is_deleted = TRUE, content = 'This message was deleted', media_url = NULL WHERE id = $1 AND sender_id = $2",
        [messageId, userId],
      );
    } else {
      await hideMessageForUser(Number(messageId), userId);
    }

    const peers = await query(
      `SELECT user_id FROM chat_members WHERE chat_id = $1`,
      [chatId],
    );
    const chatIdNorm = Array.isArray(chatId) ? chatId[0] : chatId;
    publishChatEvent({
      type: "message",
      chatId: chatIdNorm,
      userIds: peers.rows.map((r: { user_id: number }) => r.user_id),
      payload: { messageId: Number(messageId), deleted: true },
    });

    res.json({
      success: true,
      deleteForEveryone: !!(deleteForEveryone && isSender),
      hiddenForMe: !isSender || !deleteForEveryone,
    });
  } catch (err) {
    req.log.error({ err }, "delete message error");
    res.status(500).json({ success: false });
  }
});

// Edit message (text) and/or update location payload + map link (live location updates)
router.put("/:chatId/messages/:messageId", async (req: Request, res: Response) => {
  const { messageId } = req.params;
  const { userId, content, mediaUrl } = req.body as { userId?: number; content?: string; mediaUrl?: string | null };
  if (!userId) {
    res.status(400).json({ success: false });
    return;
  }
  if (!assertSameUser(req, res, userId)) return;
  const hasContent = typeof content === "string";
  const hasMedia = typeof mediaUrl === "string";
  if (!hasContent && !hasMedia) {
    res.status(400).json({ success: false });
    return;
  }
  try {
    const existing = await query(
      `SELECT created_at FROM messages WHERE id = $1 AND sender_id = $2 AND is_deleted = FALSE`,
      [messageId, userId],
    );
    if (!existing.rows[0]) {
      res.status(404).json({ success: false, message: "Message not found" });
      return;
    }
    const ageMs = Date.now() - new Date(existing.rows[0].created_at as string).getTime();
    if (ageMs > 15 * 60 * 1000) {
      res.status(403).json({
        success: false,
        message: "You can only edit messages within 15 minutes of sending.",
      });
      return;
    }
    if (hasContent && hasMedia) {
      await query(
        "UPDATE messages SET content = $1, media_url = $2, edited_at = NOW() WHERE id = $3 AND sender_id = $4 AND is_deleted = FALSE",
        [content, mediaUrl, messageId, userId]
      );
      if (hasContent) await invalidateMessageTranslations(Number(messageId));
    } else if (hasContent) {
      const trimmed = content.trim();
      if (!trimmed) {
        res.status(400).json({ success: false });
        return;
      }
      await query(
        "UPDATE messages SET content = $1, edited_at = NOW() WHERE id = $2 AND sender_id = $3 AND is_deleted = FALSE",
        [trimmed, messageId, userId]
      );
      await invalidateMessageTranslations(Number(messageId));
    } else if (hasMedia) {
      await query(
        "UPDATE messages SET media_url = $1, edited_at = NOW() WHERE id = $2 AND sender_id = $3 AND is_deleted = FALSE",
        [mediaUrl, messageId, userId]
      );
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// Star/unstar message
router.post("/:chatId/messages/:messageId/star", async (req: Request, res: Response) => {
  const { chatId } = req.params;
  const { messageId } = req.params;
  const { userId } = req.body as { userId?: number };
  if (!assertSameUser(req, res, userId)) return;
  try {
    const result = await query(
      `UPDATE messages m
       SET is_starred = NOT is_starred
       WHERE m.id = $1
         AND m.chat_id = $2
         AND EXISTS (
           SELECT 1 FROM chat_members cm
           WHERE cm.chat_id = m.chat_id AND cm.user_id = $3
         )
       RETURNING is_starred`,
      [messageId, chatId, userId]
    );
    if (!result.rows[0]) {
      res.status(404).json({ success: false, message: "Message not found" });
      return;
    }
    res.json({ success: true, isStarred: result.rows[0]?.is_starred });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

/** Keep a disappearing message so it is not auto-deleted when the timer expires. */
router.post("/:chatId/messages/:messageId/keep", async (req: Request, res: Response) => {
  const { chatId, messageId } = req.params;
  const { userId } = req.body as { userId?: number };
  if (!userId) {
    res.status(400).json({ success: false, message: "userId required" });
    return;
  }
  if (!assertSameUser(req, res, userId)) return;
  try {
    await ensureDisappearingMessageColumns();
    const result = await query(
      `UPDATE messages m
       SET is_kept = TRUE
       WHERE m.id = $1
         AND m.chat_id = $2
         AND m.type != 'system'
         AND m.expires_at IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM chat_members cm
           WHERE cm.chat_id = m.chat_id AND cm.user_id = $3
         )
       RETURNING id, chat_id, expires_at, is_kept`,
      [messageId, chatId, userId],
    );
    if (!result.rows[0]) {
      res.status(404).json({ success: false, message: "Message not found or not expiring" });
      return;
    }
    const members = await query(`SELECT user_id FROM chat_members WHERE chat_id = $1`, [chatId]);
    const userIds = members.rows.map((r: { user_id: number }) => Number(r.user_id)).filter(Boolean);
    publishChatEvent({
      type: "message",
      chatId,
      userIds,
      payload: { action: "disappear_kept", messageId: String(messageId) },
    });
    res.json({ success: true, isKept: true, messageId: String(messageId) });
  } catch (err) {
    req.log?.error?.({ err }, "keep disappearing message");
    res.status(500).json({ success: false });
  }
});

// React to message
router.post("/:chatId/messages/:messageId/react", async (req: Request, res: Response) => {
  const { messageId } = req.params;
  const { userId, emoji } = req.body as { userId?: number; emoji?: string };
  if (!userId || !emoji) { res.status(400).json({ success: false }); return; }
  if (!assertSameUser(req, res, userId)) return;
  try {
    const existing = await query(
      "SELECT emoji FROM message_reactions WHERE message_id = $1 AND user_id = $2",
      [messageId, userId]
    );
    if (existing.rows.length > 0 && existing.rows[0].emoji === emoji) {
      // Toggle off same emoji
      await query("DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2", [messageId, userId]);
      res.json({ success: true, action: "removed" });
    } else {
      await query(
        "INSERT INTO message_reactions (message_id, user_id, emoji) VALUES ($1, $2, $3) ON CONFLICT (message_id, user_id) DO UPDATE SET emoji = $3, created_at = NOW()",
        [messageId, userId, emoji]
      );
      res.json({ success: true, action: "added" });
    }
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// Mark all chats as read for the current user
router.post("/read-all", async (req: Request, res: Response) => {
  const { userId } = req.body as { userId?: number };
  if (!assertSameUser(req, res, userId)) return;
  try {
    await query(
      "UPDATE chat_members SET last_read_at = NOW() WHERE user_id = $1",
      [userId],
    );
    const privacy = await getExtendedPrivacy(Number(userId));
    if (privacy?.read_receipts_enabled !== false) {
      await query(
        `INSERT INTO message_status (message_id, user_id, status, updated_at)
         SELECT m.id, $1, 'read', NOW()
         FROM messages m
         JOIN chat_members cm ON cm.chat_id = m.chat_id AND cm.user_id = $1
         WHERE m.sender_id != $1
         ON CONFLICT (message_id, user_id) DO UPDATE SET status = 'read', updated_at = NOW()`,
        [userId],
      );
    }
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "mark all chats read error");
    res.status(500).json({ success: false });
  }
});

// Mark chat as read (also updates message_status to 'read')
router.post("/:chatId/read", async (req: Request, res: Response) => {
  const { chatId } = req.params;
  const { userId } = req.body as { userId?: number };
  if (!assertSameUser(req, res, userId)) return;
  try {
    await query(
      "UPDATE chat_members SET last_read_at = NOW() WHERE chat_id = $1 AND user_id = $2",
      [chatId, userId]
    );
    const privacy = userId ? await getExtendedPrivacy(userId) : null;
    if (privacy?.read_receipts_enabled !== false) {
      await query(`
        INSERT INTO message_status (message_id, user_id, status, updated_at)
        SELECT m.id, $2, 'read', NOW()
        FROM messages m
        WHERE m.chat_id = $1 AND m.sender_id != $2
        ON CONFLICT (message_id, user_id) DO UPDATE SET status = 'read', updated_at = NOW()
      `, [chatId, userId]);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

router.patch("/:chatId/mute", async (req: Request, res: Response) => {
  const { chatId } = req.params;
  const { userId, muted } = req.body as { userId?: number; muted?: boolean };
  if (!userId || typeof muted !== "boolean") {
    res.status(400).json({ success: false, message: "userId and muted are required" });
    return;
  }
  if (!assertSameUser(req, res, userId)) return;
  try {
    const result = await query(
      "UPDATE chat_members SET is_muted = $1 WHERE chat_id = $2 AND user_id = $3 RETURNING is_muted",
      [muted, chatId, userId],
    );
    if (!result.rows[0]) {
      res.status(404).json({ success: false, message: "Chat membership not found" });
      return;
    }
    res.json({ success: true, isMuted: result.rows[0].is_muted });
  } catch (err) {
    req.log.error({ err }, "mute chat error");
    res.status(500).json({ success: false });
  }
});

// Get wallpaper for a chat (per user)
router.get("/:chatId/wallpaper", async (req: Request, res: Response) => {
  const { chatId } = req.params;
  const { userId } = req.query as { userId?: string };
  try {
    const result = await query(
      "SELECT wallpaper FROM chat_members WHERE chat_id = $1 AND user_id = $2",
      [chatId, userId]
    );
    res.json({ success: true, wallpaper: result.rows[0]?.wallpaper ?? null });
  } catch { res.status(500).json({ success: false }); }
});

// Set wallpaper for a chat (per user)
router.put("/:chatId/wallpaper", async (req: Request, res: Response) => {
  const { chatId } = req.params;
  const { userId, wallpaper } = req.body as { userId?: number; wallpaper?: string | null };
  if (!userId) { res.status(400).json({ success: false }); return; }
  if (!assertSameUser(req, res, userId)) return;
  try {
    await query(
      "UPDATE chat_members SET wallpaper = $1 WHERE chat_id = $2 AND user_id = $3",
      [wallpaper ?? null, chatId, userId]
    );
    res.json({ success: true });
  } catch { res.status(500).json({ success: false }); }
});

// Get chat details (for chat-info screen)
router.get("/:chatId/details", async (req: Request, res: Response) => {
  const { chatId } = req.params;
  const viewerId = getAuthUserId(req);
  try {
    await ensureGroupMetadataColumns();
    const result = await query(`
      SELECT id, is_group, group_name, group_avatar_url, group_description, disappear_after_seconds,
             COALESCE(NULLIF(TRIM(group_messaging_policy), ''), 'everyone') AS group_messaging_policy,
             COALESCE(auto_translate_enabled, FALSE) AS auto_translate_enabled,
             created_by, created_at
      FROM chats WHERE id = $1
    `, [chatId]);
    if (result.rows.length === 0) { res.status(404).json({ success: false }); return; }
    const chat = result.rows[0] as Record<string, unknown>;
    let viewerIsAdmin = false;
    if (viewerId) {
      const adminRes = await query(
        "SELECT is_admin FROM chat_members WHERE chat_id = $1 AND user_id = $2",
        [chatId, viewerId],
      );
      viewerIsAdmin = Boolean(adminRes.rows[0]?.is_admin);
    }
    res.json({ success: true, chat: { ...chat, viewer_is_admin: viewerIsAdmin } });
  } catch { res.status(500).json({ success: false }); }
});

// Get group members (with real data)
router.get("/:chatId/members", async (req: Request, res: Response) => {
  const { chatId } = req.params;
  const viewerId = getAuthUserId(req) ?? Number((req.query as { userId?: string }).userId);
  try {
    const result = await query(`
      SELECT u.id, u.name, u.phone, u.avatar_url, u.about, u.is_online, u.last_seen,
             cm.is_admin, cm.joined_at, COALESCE(cm.can_send_messages, TRUE) AS can_send_messages,
             COALESCE(cm.join_pending_approval, FALSE) AS join_pending_approval
      FROM chat_members cm JOIN users u ON u.id = cm.user_id
      WHERE cm.chat_id = $1
      ORDER BY cm.is_admin DESC, u.name ASC
    `, [chatId]);
    const members = result.rows;
    if (viewerId) {
      for (const m of members) {
        if (Number(m.id) === viewerId) continue;
        const presence = await getPresenceForViewer(viewerId, Number(m.id));
        m.is_online = presence.canSee && presence.isOnline;
        m.last_seen = presence.canSee ? presence.lastSeen : null;
      }
    }
    res.json({ success: true, members });
  } catch { res.status(500).json({ success: false }); }
});

// Add member to group
router.post("/:chatId/members", async (req: Request, res: Response) => {
  const { chatId } = req.params;
  const { userId, requesterId } = req.body as { userId?: number; requesterId?: number };
  if (!userId) { res.status(400).json({ success: false }); return; }
  if (!assertSameUser(req, res, requesterId)) return;
  try {
    // Check requester is admin
    const adminCheck = await query("SELECT is_admin FROM chat_members WHERE chat_id = $1 AND user_id = $2", [chatId, requesterId]);
    if (!adminCheck.rows[0]?.is_admin) { res.status(403).json({ success: false, message: "Not admin" }); return; }
    const allowed = await canAddUserToGroup(Number(requesterId), userId);
    if (!allowed) {
      res.status(403).json({
        success: false,
        message: "This person cannot be added to groups based on their privacy settings.",
      });
      return;
    }
    const pol = await query(
      `SELECT COALESCE(NULLIF(TRIM(group_messaging_policy), ''), 'everyone') AS policy FROM chats WHERE id = $1`,
      [chatId],
    );
    await ensureChatMemberHistoryClearedColumn();
    const policy = String(pol.rows[0]?.policy || "everyone");
    const canSendDefault = memberCanSendOnJoin(policy);
    // Re-join resets send access and hides messages from before this join (WhatsApp-style).
    await query(
      `INSERT INTO chat_members (chat_id, user_id, can_send_messages, history_cleared_at, joined_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       ON CONFLICT (chat_id, user_id) DO UPDATE SET
         can_send_messages = EXCLUDED.can_send_messages,
         history_cleared_at = NOW(),
         joined_at = NOW()`,
      [chatId, userId, canSendDefault],
    );
    res.json({ success: true });
  } catch { res.status(500).json({ success: false }); }
});

// Create or refresh secure group invite link (admin only; opaque token, not numeric id).
router.post("/:chatId/invite-link", async (req: Request, res: Response) => {
  const { chatId } = req.params;
  const { requesterId } = req.body as { requesterId?: number };
  if (!requesterId || !assertSameUser(req, res, requesterId)) return;
  try {
    const adminCheck = await query(
      "SELECT is_admin FROM chat_members WHERE chat_id = $1 AND user_id = $2",
      [chatId, requesterId],
    );
    if (!adminCheck.rows[0]?.is_admin) {
      res.status(403).json({ success: false, message: "Only admins can share invite links." });
      return;
    }
    const group = await query("SELECT is_group, group_name FROM chats WHERE id = $1", [chatId]);
    if (!group.rows[0]?.is_group) {
      res.status(400).json({ success: false, message: "Not a group chat." });
      return;
    }
    const link = await createGroupInviteLink(Number(chatId), requesterId);
    res.json({
      success: true,
      invite: {
        token: link.token,
        publicUrl: link.publicUrl,
        deepLink: link.deepLink,
        groupName: group.rows[0]?.group_name ?? "Group",
      },
    });
  } catch (err) {
    req.log.error({ err }, "create group invite link");
    res.status(500).json({ success: false });
  }
});

// Pending members who joined via invite link (admin only).
router.get("/:chatId/pending-joins", async (req: Request, res: Response) => {
  const { chatId } = req.params;
  const requesterId = Number(req.query.requesterId);
  if (!requesterId || !assertSameUser(req, res, requesterId)) return;
  try {
    const adminCheck = await query(
      "SELECT is_admin FROM chat_members WHERE chat_id = $1 AND user_id = $2",
      [chatId, requesterId],
    );
    if (!adminCheck.rows[0]?.is_admin) {
      res.status(403).json({ success: false });
      return;
    }
    await ensureGroupInviteTables();
    const r = await query(
      `SELECT u.id, u.name, u.phone, u.avatar_url, cm.joined_at
       FROM chat_members cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.chat_id = $1 AND COALESCE(cm.join_pending_approval, FALSE) = TRUE
       ORDER BY cm.joined_at ASC`,
      [chatId],
    );
    res.json({ success: true, pending: r.rows });
  } catch (err) {
    req.log.error({ err }, "pending joins list");
    res.status(500).json({ success: false });
  }
});

router.post("/:chatId/pending-joins/:memberId/approve", async (req: Request, res: Response) => {
  const { chatId, memberId } = req.params;
  const { requesterId } = req.body as { requesterId?: number };
  if (!requesterId || !assertSameUser(req, res, requesterId)) return;
  try {
    const adminCheck = await query(
      "SELECT is_admin FROM chat_members WHERE chat_id = $1 AND user_id = $2",
      [chatId, requesterId],
    );
    if (!adminCheck.rows[0]?.is_admin) {
      res.status(403).json({ success: false, message: "Not admin" });
      return;
    }
    const pol = await query(
      `SELECT COALESCE(NULLIF(TRIM(group_messaging_policy), ''), 'everyone') AS policy FROM chats WHERE id = $1`,
      [chatId],
    );
    const policy = String(pol.rows[0]?.policy || "everyone");
    const canSend = canSendAfterInviteApproval(policy, false);
    const updated = await query(
      `UPDATE chat_members
       SET join_pending_approval = FALSE, can_send_messages = $3
       WHERE chat_id = $1 AND user_id = $2 AND COALESCE(join_pending_approval, FALSE) = TRUE
       RETURNING user_id`,
      [chatId, memberId, canSend],
    );
    if (!updated.rows[0]) {
      res.status(404).json({ success: false, message: "No pending request for this member." });
      return;
    }
    res.json({ success: true, canSendMessages: canSend });
  } catch (err) {
    req.log.error({ err }, "approve pending join");
    res.status(500).json({ success: false });
  }
});

router.post("/:chatId/pending-joins/:memberId/reject", async (req: Request, res: Response) => {
  const { chatId, memberId } = req.params;
  const { requesterId } = req.body as { requesterId?: number };
  if (!requesterId || !assertSameUser(req, res, requesterId)) return;
  try {
    const adminCheck = await query(
      "SELECT is_admin FROM chat_members WHERE chat_id = $1 AND user_id = $2",
      [chatId, requesterId],
    );
    if (!adminCheck.rows[0]?.is_admin) {
      res.status(403).json({ success: false, message: "Not admin" });
      return;
    }
    const deleted = await query(
      `DELETE FROM chat_members
       WHERE chat_id = $1 AND user_id = $2 AND COALESCE(join_pending_approval, FALSE) = TRUE
       RETURNING user_id`,
      [chatId, memberId],
    );
    if (!deleted.rows[0]) {
      res.status(404).json({ success: false, message: "No pending request for this member." });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "reject pending join");
    res.status(500).json({ success: false });
  }
});

// Remove member from group
router.delete("/:chatId/members/:memberId", async (req: Request, res: Response) => {
  const { chatId, memberId } = req.params;
  const { requesterId } = req.body as { requesterId?: number };
  if (!assertSameUser(req, res, requesterId)) return;
  try {
    // Admin or self-leave
    const adminCheck = await query("SELECT is_admin FROM chat_members WHERE chat_id = $1 AND user_id = $2", [chatId, requesterId]);
    if (!adminCheck.rows[0]?.is_admin && String(requesterId) !== memberId) {
      res.status(403).json({ success: false, message: "Not admin" }); return;
    }
    await query("DELETE FROM chat_members WHERE chat_id = $1 AND user_id = $2", [chatId, memberId]);
    res.json({ success: true });
  } catch { res.status(500).json({ success: false }); }
});

// Toggle admin
router.put("/:chatId/members/:memberId/admin", async (req: Request, res: Response) => {
  const { chatId, memberId } = req.params;
  const { requesterId, isAdmin } = req.body as { requesterId?: number; isAdmin?: boolean };
  if (!assertSameUser(req, res, requesterId)) return;
  try {
    const adminCheck = await query("SELECT is_admin FROM chat_members WHERE chat_id = $1 AND user_id = $2", [chatId, requesterId]);
    if (!adminCheck.rows[0]?.is_admin) { res.status(403).json({ success: false }); return; }
    await query("UPDATE chat_members SET is_admin = $1 WHERE chat_id = $2 AND user_id = $3", [isAdmin ?? true, chatId, memberId]);

    if (isAdmin ?? true) {
      const nameRes = await query("SELECT name FROM users WHERE id = $1", [memberId]);
      const { insertChatSystemMessage } = await import("../lib/chatSystemMessages");
      await insertChatSystemMessage(chatId, Number(requesterId), {
        kind: "promoted_admin",
        targetUserId: Number(memberId),
        targetUserName: nameRes.rows[0]?.name ?? undefined,
      });
    }

    res.json({ success: true });
  } catch { res.status(500).json({ success: false }); }
});

// Set group messaging policy (admin only)
router.put("/:chatId/group-messaging-policy", async (req: Request, res: Response) => {
  const { chatId } = req.params;
  const { requesterId, policy, resetAllowlist } = req.body as {
    requesterId?: number;
    policy?: string;
    resetAllowlist?: boolean;
  };
  const allowed = new Set(["everyone", "admins_only", "allowlist"]);
  if (!requesterId || !policy || !allowed.has(policy)) {
    res.status(400).json({ success: false, message: "Invalid policy" });
    return;
  }
  if (!assertSameUser(req, res, requesterId)) return;
  try {
    const adminCheck = await query(
      "SELECT is_admin FROM chat_members WHERE chat_id = $1 AND user_id = $2",
      [chatId, requesterId],
    );
    if (!adminCheck.rows[0]?.is_admin) {
      res.status(403).json({ success: false, message: "Only a group admin can change this setting." });
      return;
    }
    const g = await query("SELECT is_group FROM chats WHERE id = $1", [chatId]);
    if (!g.rows[0]?.is_group) {
      res.status(400).json({ success: false, message: "Not a group chat" });
      return;
    }

    if (policy === "everyone") {
      await query("UPDATE chat_members SET can_send_messages = TRUE WHERE chat_id = $1", [chatId]);
    } else if (policy === "allowlist" && resetAllowlist !== false) {
      await query(
        "UPDATE chat_members SET can_send_messages = (is_admin = TRUE) WHERE chat_id = $1",
        [chatId],
      );
    }

    await query("UPDATE chats SET group_messaging_policy = $1 WHERE id = $2", [policy, chatId]);
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "group-messaging-policy");
    res.status(500).json({ success: false });
  }
});

// Toggle send permission for a member (admin only; only when policy is allowlist)
router.put("/:chatId/members/:memberId/send-permission", async (req: Request, res: Response) => {
  const { chatId, memberId } = req.params;
  const { requesterId, canSendMessages } = req.body as { requesterId?: number; canSendMessages?: boolean };
  if (!requesterId || typeof canSendMessages !== "boolean") {
    res.status(400).json({ success: false });
    return;
  }
  if (!assertSameUser(req, res, requesterId)) return;
  try {
    const adminCheck = await query(
      "SELECT is_admin FROM chat_members WHERE chat_id = $1 AND user_id = $2",
      [chatId, requesterId],
    );
    if (!adminCheck.rows[0]?.is_admin) {
      res.status(403).json({ success: false, message: "Only a group admin can change this setting." });
      return;
    }
    const pol = await query(
      `SELECT COALESCE(NULLIF(TRIM(group_messaging_policy), ''), 'everyone') AS policy FROM chats WHERE id = $1`,
      [chatId],
    );
    if (String(pol.rows[0]?.policy || "everyone") !== "allowlist") {
      res.status(400).json({
        success: false,
        message: "Set group messaging to “Selected members” before managing individual send access.",
      });
      return;
    }
    const target = await query(
      "SELECT is_admin FROM chat_members WHERE chat_id = $1 AND user_id = $2",
      [chatId, memberId],
    );
    if (!target.rows[0]) {
      res.status(404).json({ success: false });
      return;
    }
    if (target.rows[0].is_admin) {
      res.json({ success: true, message: "Admins always have send access." });
      return;
    }
    await query(
      "UPDATE chat_members SET can_send_messages = $1 WHERE chat_id = $2 AND user_id = $3",
      [canSendMessages, chatId, memberId],
    );
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "send-permission");
    res.status(500).json({ success: false });
  }
});

// Update group profile photo (admin only)
router.put("/:chatId/group-avatar", async (req: Request, res: Response) => {
  const { chatId } = req.params;
  const { requesterId, base64, mimeType } = req.body as {
    requesterId?: number;
    base64?: string;
    mimeType?: string;
  };
  const userId = Number(requesterId);
  if (!userId || !base64) {
    res.status(400).json({ success: false, message: "requesterId and base64 are required" });
    return;
  }
  if (!assertSameUser(req, res, userId)) return;
  try {
    const member = await query(
      `SELECT c.is_group, cm.is_admin
       FROM chats c
       JOIN chat_members cm ON cm.chat_id = c.id AND cm.user_id = $2
       WHERE c.id = $1`,
      [chatId, userId],
    );
    if (!member.rows[0]) {
      res.status(404).json({ success: false, message: "Group not found or you are not a member." });
      return;
    }
    if (!member.rows[0].is_group) {
      res.status(400).json({ success: false, message: "Profile photos are only available for groups." });
      return;
    }
    if (!member.rows[0].is_admin) {
      res.status(403).json({ success: false, message: "Only group admins can change the group photo." });
      return;
    }
    const dataUrl = `data:${mimeType ?? "image/jpeg"};base64,${base64}`;
    const result = await query(
      "UPDATE chats SET group_avatar_url = $1 WHERE id = $2 RETURNING group_avatar_url",
      [dataUrl, chatId],
    );
    res.json({ success: true, groupAvatarUrl: result.rows[0]?.group_avatar_url ?? dataUrl });
  } catch (err) {
    req.log.error({ err }, "update group avatar");
    res.status(500).json({ success: false, message: "Could not update group photo." });
  }
});

// Update group description
router.put("/:chatId/description", async (req: Request, res: Response) => {
  const { chatId } = req.params;
  const { description, requesterId } = req.body as { description?: string; requesterId?: number };
  const userId = Number(requesterId);
  if (!userId) {
    res.status(400).json({ success: false, message: "requesterId is required" });
    return;
  }
  if (!assertSameUser(req, res, userId)) return;
  const nextDescription = String(description ?? "").trim();
  if (nextDescription.length > 512) {
    res.status(400).json({ success: false, message: "Group description must be 512 characters or less." });
    return;
  }
  try {
    await ensureGroupMetadataColumns();
    const member = await query(
      `SELECT c.is_group, cm.is_admin
       FROM chats c
       JOIN chat_members cm ON cm.chat_id = c.id AND cm.user_id = $2
       WHERE c.id = $1`,
      [chatId, userId],
    );
    if (!member.rows[0]) {
      res.status(404).json({ success: false, message: "Group not found or you are not a member." });
      return;
    }
    if (!member.rows[0].is_group) {
      res.status(400).json({ success: false, message: "Descriptions are only available for groups." });
      return;
    }
    if (!member.rows[0].is_admin) {
      res.status(403).json({ success: false, message: "Only group admins can edit the group description." });
      return;
    }
    const result = await query(
      "UPDATE chats SET group_description = $1 WHERE id = $2 RETURNING group_description",
      [nextDescription || null, chatId],
    );
    res.json({ success: true, groupDescription: result.rows[0]?.group_description ?? "" });
  } catch (err) {
    req.log.error({ err }, "update group description");
    res.status(500).json({ success: false, message: "Could not update group description." });
  }
});

// Set disappearing messages (+ Videh system message for all members)
router.put("/:chatId/disappear", async (req: Request, res: Response) => {
  const { chatId } = req.params;
  const authUserId = getAuthUserId(req);
  if (!authUserId) {
    res.status(401).json({ success: false, message: "Authentication required" });
    return;
  }
  const { seconds } = req.body as { seconds?: number | null };
  const normalizedSeconds =
    seconds == null || seconds <= 0 ? null : Math.floor(Number(seconds));
  try {
    const member = await query(
      "SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2",
      [chatId, authUserId],
    );
    if (member.rows.length === 0) {
      res.status(403).json({ success: false, message: "Not a member of this chat" });
      return;
    }

    await query("UPDATE chats SET disappear_after_seconds = $1 WHERE id = $2", [normalizedSeconds, chatId]);

    const { messageId } = await insertChatSystemMessage(chatId, authUserId, {
      kind: "disappear_timer",
      seconds: normalizedSeconds,
    });
    const msgResult = await query(`SELECT * FROM messages WHERE id = $1`, [messageId]);
    const message = msgResult.rows[0];

    res.json({
      success: true,
      disappearAfterSeconds: normalizedSeconds,
      message,
    });
  } catch (err) {
    req.log.error({ err }, "set disappear error");
    res.status(500).json({ success: false });
  }
});

// Message info (delivery/read/not-seen status for each recipient)
router.get("/:chatId/messages/:messageId/info", async (req: Request, res: Response) => {
  const { chatId, messageId } = req.params;
  const userId = Number(req.query["userId"]);
  if (!assertSameUser(req, res, userId)) return;
  try {
    const msg = await query(
      "SELECT sender_id FROM messages WHERE id = $1 AND chat_id = $2",
      [messageId, chatId],
    );
    if (!msg.rows[0]) {
      res.status(404).json({ success: false, message: "Message not found" });
      return;
    }
    const senderId = Number(msg.rows[0].sender_id);
    if (senderId !== userId) {
      res.status(403).json({ success: false, message: "Only the sender can view message info" });
      return;
    }
    const result = await query(`
      SELECT
        u.id AS user_id,
        COALESCE(NULLIF(TRIM(u.name), ''), u.phone) AS name,
        u.phone,
        u.avatar_url,
        COALESCE(ms.status, 'sent') AS status,
        COALESCE(ms.updated_at, cm.joined_at) AS updated_at
      FROM chat_members cm
      JOIN users u ON u.id = cm.user_id
      LEFT JOIN message_status ms ON ms.message_id = $2 AND ms.user_id = cm.user_id
      WHERE cm.chat_id = $1
        AND cm.user_id != $3
      ORDER BY CASE COALESCE(ms.status, 'sent') WHEN 'read' THEN 0 WHEN 'delivered' THEN 1 ELSE 2 END,
               COALESCE(ms.updated_at, cm.joined_at) DESC,
               u.name
    `, [chatId, messageId, senderId]);
    res.json({ success: true, receipts: result.rows });
  } catch (err) {
    req.log.error({ err }, "message info");
    res.status(500).json({ success: false });
  }
});

// Group auto-translate toggle (admin only)
router.put("/:chatId/auto-translate", async (req: Request, res: Response) => {
  const { chatId } = req.params;
  const authUserId = getAuthUserId(req);
  if (!authUserId) {
    res.status(401).json({ success: false, message: "Authentication required" });
    return;
  }
  const { enabled } = req.body as { enabled?: boolean };
  if (typeof enabled !== "boolean") {
    res.status(400).json({ success: false, message: "enabled must be a boolean" });
    return;
  }
  try {
    await ensureTranslationTables();
    const adminCheck = await query(
      "SELECT cm.is_admin, c.is_group FROM chat_members cm JOIN chats c ON c.id = cm.chat_id WHERE cm.chat_id = $1 AND cm.user_id = $2",
      [chatId, authUserId],
    );
    if (!adminCheck.rows[0]?.is_group) {
      res.status(400).json({ success: false, message: "Not a group chat" });
      return;
    }
    if (!adminCheck.rows[0]?.is_admin) {
      res.status(403).json({ success: false, message: "Only a group admin can change this setting." });
      return;
    }
    await query("UPDATE chats SET auto_translate_enabled = $1 WHERE id = $2", [enabled, chatId]);
    res.json({ success: true, autoTranslateEnabled: enabled });
  } catch (err) {
    req.log.error({ err }, "auto-translate toggle");
    res.status(500).json({ success: false });
  }
});

// Per-member translation preferences in a group
router.get("/:chatId/translation-settings", async (req: Request, res: Response) => {
  const { chatId } = req.params;
  const userId = Number(req.query.userId);
  if (!userId || !assertSameUser(req, res, userId)) return;
  try {
    await ensureTranslationTables();
    const prefs = await getViewerTranslationPrefs(chatId, userId);
    if (!prefs) {
      res.status(404).json({ success: false });
      return;
    }
    const member = await query(
      `SELECT translate_lang, auto_translate_personal FROM chat_members WHERE chat_id = $1 AND user_id = $2`,
      [chatId, userId],
    );
    const row = member.rows[0] as { translate_lang: string | null; auto_translate_personal: boolean } | undefined;
    res.json({
      success: true,
      groupAutoTranslateEnabled: prefs.groupEnabled,
      memberTranslateLang: row?.translate_lang ? normalizeLangCode(row.translate_lang) : null,
      memberAutoTranslateEnabled: row?.auto_translate_personal ?? true,
      effectiveLang: prefs.targetLang,
      effectiveLangName: LANG_DISPLAY_NAMES[prefs.targetLang] ?? prefs.targetLang,
    });
  } catch (err) {
    req.log.error({ err }, "translation-settings get");
    res.status(500).json({ success: false });
  }
});

router.put("/:chatId/translation-settings", async (req: Request, res: Response) => {
  const { chatId } = req.params;
  const { userId, translateLang, personalEnabled } = req.body as {
    userId?: number;
    translateLang?: string | null;
    personalEnabled?: boolean;
  };
  if (!userId || !assertSameUser(req, res, userId)) return;
  try {
    await ensureTranslationTables();
    const member = await query(
      "SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2",
      [chatId, userId],
    );
    if (!member.rows[0]) {
      res.status(403).json({ success: false, message: "Not a member of this chat" });
      return;
    }
    if (translateLang !== undefined) {
      const normalized = translateLang == null || translateLang === ""
        ? null
        : normalizeLangCode(translateLang);
      await query(
        "UPDATE chat_members SET translate_lang = $1 WHERE chat_id = $2 AND user_id = $3",
        [normalized, chatId, userId],
      );
    }
    if (typeof personalEnabled === "boolean") {
      await query(
        "UPDATE chat_members SET auto_translate_personal = $1 WHERE chat_id = $2 AND user_id = $3",
        [personalEnabled, chatId, userId],
      );
    }
    const prefs = await getViewerTranslationPrefs(chatId, userId);
    res.json({
      success: true,
      effectiveLang: prefs?.targetLang ?? "en",
      effectiveLangName: LANG_DISPLAY_NAMES[prefs?.targetLang ?? "en"] ?? "en",
    });
  } catch (err) {
    req.log.error({ err }, "translation-settings put");
    res.status(500).json({ success: false });
  }
});

export default router;

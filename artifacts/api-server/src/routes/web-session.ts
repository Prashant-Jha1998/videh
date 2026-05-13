import crypto, { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Router, type Request, type Response } from "express";
import multer from "multer";
import { query } from "../lib/db";
import { publicMediaUrl } from "../lib/mediaStorage";
import { attachChatEventStream, publishChatEvent } from "../lib/realtime";

const router = Router();
const currentFilePath = fileURLToPath(import.meta.url);
const routesDir = path.dirname(currentFilePath);
const apiServerDir = path.resolve(routesDir, "../..");
const chatUploadsDir = path.join(apiServerDir, "uploads", "chats");
fs.mkdirSync(chatUploadsDir, { recursive: true });

type LinkedSession = {
  userId: number;
};

function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function detectPlatform(ua: string): string {
  if (/windows/i.test(ua)) return "Windows";
  if (/macintosh|mac os x/i.test(ua)) return "macOS";
  if (/linux/i.test(ua)) return "Linux";
  if (/android/i.test(ua)) return "Android";
  if (/iphone|ipad/i.test(ua)) return "iOS";
  return "Web";
}

function detectBrowser(ua: string): string {
  if (/edg\//i.test(ua)) return "Edge";
  if (/chrome/i.test(ua)) return "Chrome";
  if (/firefox/i.test(ua)) return "Firefox";
  if (/safari/i.test(ua)) return "Safari";
  if (/opera/i.test(ua)) return "Opera";
  return "Browser";
}

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
  if (ext === ".aac") return "audio/aac";
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
      data BYTEA NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  chatMediaTableEnsured = true;
}

async function getLinkedSession(token: string): Promise<LinkedSession | null> {
  const result = await query(
    `UPDATE web_sessions
     SET last_active = NOW()
     WHERE token = $1 AND status = 'linked' AND expires_at > NOW()
     RETURNING user_id`,
    [token],
  );
  const userId = Number(result.rows[0]?.user_id);
  return Number.isFinite(userId) ? { userId } : null;
}

async function requireLinkedSession(req: Request, res: Response): Promise<LinkedSession | null> {
  const session = await getLinkedSession(routeParam(req.params.token));
  if (!session) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return null;
  }
  return session;
}

async function requireChatMember(userId: number, chatId: string | number, res: Response): Promise<boolean> {
  const result = await query(
    "SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2",
    [chatId, userId],
  );
  if (!result.rows[0]) {
    res.status(403).json({ success: false, message: "You are not a member of this chat." });
    return false;
  }
  return true;
}

async function getChatMemberIds(chatId: string | number): Promise<number[]> {
  const result = await query("SELECT user_id FROM chat_members WHERE chat_id = $1", [chatId]);
  return result.rows.map((row: any) => Number(row.user_id)).filter(Number.isFinite);
}

async function canSendToChat(chatId: string | number, userId: number): Promise<{ ok: boolean; message?: string }> {
  const membership = await query(
    `SELECT c.is_group,
            COALESCE(NULLIF(TRIM(c.group_messaging_policy), ''), 'everyone') AS policy,
            cm.is_admin,
            COALESCE(cm.can_send_messages, TRUE) AS can_send_messages
     FROM chats c
     INNER JOIN chat_members cm ON cm.chat_id = c.id AND cm.user_id = $2
     WHERE c.id = $1`,
    [chatId, userId],
  );
  const row = membership.rows[0];
  if (!row) return { ok: false, message: "You are not a member of this chat." };
  if (row.is_group && row.policy === "admins_only" && !row.is_admin) {
    return { ok: false, message: "Only group admins can send messages in this group." };
  }
  if (row.is_group && row.policy === "allowlist" && !row.is_admin && !row.can_send_messages) {
    return { ok: false, message: "You do not have permission to send messages in this group." };
  }
  if (!row.is_group) {
    const blocked = await query(
      `SELECT EXISTS(
        SELECT 1
        FROM chat_members me
        JOIN chat_members other ON other.chat_id = me.chat_id AND other.user_id != me.user_id
        JOIN blocked_users b
          ON (b.blocker_id = me.user_id AND b.blocked_id = other.user_id)
          OR (b.blocker_id = other.user_id AND b.blocked_id = me.user_id)
        WHERE me.chat_id = $1 AND me.user_id = $2
      ) AS blocked`,
      [chatId, userId],
    );
    if (blocked.rows[0]?.blocked) return { ok: false, message: "You cannot send messages to this contact." };
  }
  return { ok: true };
}

function publishForChat(type: "message" | "read" | "archive" | "typing", chatId: string | number, userIds: number[], payload?: unknown): void {
  publishChatEvent({ type, chatId, userIds, payload });
}

async function sendMessageForWeb(req: Request, res: Response, chatId: string | number, userId: number): Promise<void> {
  const { content, type, replyToId, mediaUrl, isForwarded, forwardCount, isViewOnce } = req.body as {
    content?: string;
    type?: string;
    replyToId?: number;
    mediaUrl?: string;
    isForwarded?: boolean;
    forwardCount?: number;
    isViewOnce?: boolean;
  };
  const trimmedContent = typeof content === "string" ? content.trim() : "";
  if (!trimmedContent && !mediaUrl) {
    res.status(400).json({ success: false, message: "Message content or media is required." });
    return;
  }
  const permission = await canSendToChat(chatId, userId);
  if (!permission.ok) {
    res.status(403).json({ success: false, message: permission.message });
    return;
  }

  const messageType = type ?? (mediaUrl ? "image" : "text");
  const result = await query(
    `INSERT INTO messages (chat_id, sender_id, content, type, reply_to_id, media_url, is_forwarded, forward_count, is_view_once)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [chatId, userId, trimmedContent || "Attachment", messageType, replyToId ?? null, mediaUrl ?? null, isForwarded ?? false, forwardCount ?? 0, isViewOnce ?? false],
  );
  const recipients = (await getChatMemberIds(chatId)).filter((id) => id !== userId);
  if (recipients.length > 0) {
    await query(
      `INSERT INTO message_status (message_id, user_id, status)
       SELECT $1, unnest($2::int[]), 'delivered'
       ON CONFLICT (message_id, user_id)
       DO UPDATE SET status = 'delivered', updated_at = NOW()`,
      [result.rows[0].id, recipients],
    );
  }
  publishForChat("message", chatId, [userId, ...recipients], { messageId: result.rows[0].id });
  res.json({ success: true, message: result.rows[0] });
}

router.post("/", async (req: Request, res: Response) => {
  try {
    const token = randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    const ua = req.headers["user-agent"] ?? "";
    const platform = detectPlatform(ua);
    const browser = detectBrowser(ua);
    const deviceName = `${browser} on ${platform}`;

    await query(
      "INSERT INTO web_sessions (token, status, expires_at, device_name, platform) VALUES ($1, 'pending', $2, $3, $4)",
      [token, expiresAt, deviceName, platform],
    );

    res.json({ success: true, token, expiresAt: expiresAt.toISOString() });
  } catch (err) {
    req.log.error({ err }, "create web session error");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/:token/link", async (req: Request, res: Response) => {
  const token = routeParam(req.params.token);
  const { userId } = req.body as { userId?: number };
  if (!userId) {
    res.status(400).json({ success: false, message: "userId required" });
    return;
  }

  try {
    const sessionResult = await query(
      "SELECT * FROM web_sessions WHERE token = $1 AND status = 'pending' AND expires_at > NOW()",
      [token],
    );
    if (!sessionResult.rows.length) {
      res.status(404).json({ success: false, message: "Session not found or expired" });
      return;
    }

    await query(
      "UPDATE web_sessions SET status = 'linked', user_id = $1, linked_at = NOW(), last_active = NOW(), expires_at = NOW() + INTERVAL '30 days' WHERE token = $2",
      [userId, token],
    );

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "link web session error");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/:token/status", async (req: Request, res: Response) => {
  const token = routeParam(req.params.token);
  try {
    const sessionResult = await query(
      `SELECT ws.status, ws.expires_at, ws.user_id,
              u.name, u.phone, u.about, u.avatar_url
       FROM web_sessions ws
       LEFT JOIN users u ON u.id = ws.user_id
       WHERE ws.token = $1`,
      [token],
    );
    if (!sessionResult.rows.length) {
      res.status(404).json({ success: false, message: "Session not found" });
      return;
    }
    const session = sessionResult.rows[0];
    if (new Date(session.expires_at) < new Date()) {
      res.json({ success: true, status: "expired" });
      return;
    }
    if (session.status === "linked") {
      res.json({
        success: true,
        status: "linked",
        user: {
          id: session.user_id,
          name: session.name,
          phone: session.phone,
          about: session.about,
          avatarUrl: session.avatar_url,
        },
      });
      return;
    }
    res.json({ success: true, status: session.status });
  } catch (err) {
    req.log.error({ err }, "web session status error");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/:token/events", async (req: Request, res: Response) => {
  try {
    const session = await getLinkedSession(routeParam(req.params.token));
    if (!session) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }
    const detach = attachChatEventStream(session.userId, res);
    req.on("close", detach);
  } catch (err) {
    req.log.error({ err }, "web session events error");
    res.status(500).json({ success: false });
  }
});

router.get("/:token/chats", async (req: Request, res: Response) => {
  try {
    const session = await requireLinkedSession(req, res);
    if (!session) return;
    const chatsResult = await query(
      `SELECT
        c.id, c.is_group, c.group_name, c.group_avatar_url,
        cm.is_muted, cm.is_pinned,
        (
          SELECT json_build_object(
            'id', m.id, 'content', m.content, 'type', m.type, 'media_url', m.media_url,
            'sender_id', m.sender_id, 'created_at', m.created_at, 'is_deleted', m.is_deleted
          )
          FROM messages m WHERE m.chat_id = c.id AND m.is_deleted = FALSE
          ORDER BY m.created_at DESC LIMIT 1
        ) AS last_message,
        (
          SELECT COUNT(*)::int FROM messages m
          WHERE m.chat_id = c.id AND m.sender_id != $1::int
            AND m.created_at > cm.last_read_at AND m.is_deleted = FALSE
        ) AS unread_count,
        (
          SELECT json_agg(json_build_object(
            'id', u.id, 'name', u.name, 'phone', u.phone, 'about', u.about,
            'avatar_url', u.avatar_url, 'is_online', u.is_online, 'last_seen', u.last_seen
          ))
          FROM chat_members cm2 JOIN users u ON u.id = cm2.user_id
          WHERE cm2.chat_id = c.id AND cm2.user_id != $1::int
        ) AS other_members
      FROM chats c
      JOIN chat_members cm ON cm.chat_id = c.id AND cm.user_id = $1::int
      ORDER BY (SELECT created_at FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) DESC NULLS LAST`,
      [session.userId],
    );
    res.json({ success: true, chats: chatsResult.rows, userId: session.userId });
  } catch (err) {
    req.log.error({ err }, "web session chats error");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/:token/media", chatMediaUpload.single("file"), async (req: Request, res: Response) => {
  try {
    const session = await requireLinkedSession(req, res);
    if (!session) return;
    if (!req.file) {
      res.status(400).json({ success: false, message: "file is required" });
      return;
    }
    await ensureChatMediaTable();
    const data = await fs.promises.readFile(req.file.path);
    const mimeType = mimeFromFilename(req.file.filename, req.file.mimetype);
    await query(
      `INSERT INTO chat_media_files (filename, mime_type, size_bytes, data)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (filename)
       DO UPDATE SET mime_type = EXCLUDED.mime_type, size_bytes = EXCLUDED.size_bytes, data = EXCLUDED.data`,
      [req.file.filename, mimeType, req.file.size, data],
    );
    await fs.promises.unlink(req.file.path).catch(() => {});
    const rel = `/api/chats/media/${encodeURIComponent(req.file.filename)}`;
    res.json({ success: true, url: publicMediaUrl(req, rel), mimeType, size: req.file.size, userId: session.userId });
  } catch (err) {
    req.log.error({ err }, "web session media upload error");
    if (req.file?.path) await fs.promises.unlink(req.file.path).catch(() => {});
    res.status(500).json({ success: false, message: "Could not save chat media." });
  }
});

router.get("/:token/chats/:chatId/messages", async (req: Request, res: Response) => {
  const chatId = routeParam(req.params.chatId);
  try {
    const session = await requireLinkedSession(req, res);
    if (!session || !(await requireChatMember(session.userId, chatId, res))) return;
    const limit = Math.min(Number(req.query.limit ?? 80) || 80, 120);
    const before = typeof req.query.before === "string" ? req.query.before : undefined;
    const result = await query(
      `SELECT
        m.id, m.chat_id, m.sender_id, m.content, m.type, m.media_url,
        m.reply_to_id, m.is_deleted, m.is_forwarded, m.forward_count,
        m.is_starred, m.is_view_once, m.edited_at, m.created_at,
        u.name AS sender_name, u.avatar_url AS sender_avatar,
        rm.content AS reply_content, rm_u.name AS reply_sender_name,
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
      LEFT JOIN users u ON u.id = m.sender_id
      LEFT JOIN messages rm ON rm.id = m.reply_to_id
      LEFT JOIN users rm_u ON rm_u.id = rm.sender_id
      WHERE m.chat_id = $1
        ${before ? "AND m.created_at < $3" : ""}
      ORDER BY m.created_at DESC
      LIMIT $2`,
      before ? [chatId, limit, before] : [chatId, limit],
    );
    res.json({ success: true, messages: result.rows.reverse() });
  } catch (err) {
    req.log.error({ err }, "web session messages error");
    res.status(500).json({ success: false });
  }
});

router.post("/:token/messages", async (req: Request, res: Response) => {
  const session = await requireLinkedSession(req, res);
  if (!session) return;
  const { chatId } = req.body as { chatId?: string };
  if (!chatId) {
    res.status(400).json({ success: false, message: "chatId is required" });
    return;
  }
  await sendMessageForWeb(req, res, chatId, session.userId);
});

router.post("/:token/chats/:chatId/messages", async (req: Request, res: Response) => {
  const session = await requireLinkedSession(req, res);
  if (!session) return;
  await sendMessageForWeb(req, res, routeParam(req.params.chatId), session.userId);
});

router.post("/:token/chats/:chatId/read", async (req: Request, res: Response) => {
  const chatId = routeParam(req.params.chatId);
  try {
    const session = await requireLinkedSession(req, res);
    if (!session || !(await requireChatMember(session.userId, chatId, res))) return;
    await query("UPDATE chat_members SET last_read_at = NOW() WHERE chat_id = $1 AND user_id = $2", [chatId, session.userId]);
    await query(
      `INSERT INTO message_status (message_id, user_id, status, updated_at)
       SELECT m.id, $2, 'read', NOW()
       FROM messages m
       WHERE m.chat_id = $1 AND m.sender_id != $2
       ON CONFLICT (message_id, user_id) DO UPDATE SET status = 'read', updated_at = NOW()`,
      [chatId, session.userId],
    );
    publishForChat("read", chatId, await getChatMemberIds(chatId), { userId: session.userId });
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "web read error");
    res.status(500).json({ success: false });
  }
});

router.post("/:token/chats/:chatId/typing", async (req: Request, res: Response) => {
  const chatId = routeParam(req.params.chatId);
  try {
    const session = await requireLinkedSession(req, res);
    if (!session || !(await requireChatMember(session.userId, chatId, res))) return;
    await query(
      `INSERT INTO typing_sessions (chat_id, user_id, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (chat_id, user_id) DO UPDATE SET updated_at = NOW()`,
      [chatId, session.userId],
    );
    publishForChat("typing", chatId, await getChatMemberIds(chatId), { userId: session.userId, active: true });
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "web typing error");
    res.status(500).json({ success: false });
  }
});

router.delete("/:token/chats/:chatId/typing", async (req: Request, res: Response) => {
  const chatId = routeParam(req.params.chatId);
  try {
    const session = await requireLinkedSession(req, res);
    if (!session || !(await requireChatMember(session.userId, chatId, res))) return;
    await query("DELETE FROM typing_sessions WHERE chat_id = $1 AND user_id = $2", [chatId, session.userId]);
    publishForChat("typing", chatId, await getChatMemberIds(chatId), { userId: session.userId, active: false });
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "web clear typing error");
    res.status(500).json({ success: false });
  }
});

router.get("/:token/chats/:chatId/typing", async (req: Request, res: Response) => {
  const chatId = routeParam(req.params.chatId);
  try {
    const session = await requireLinkedSession(req, res);
    if (!session || !(await requireChatMember(session.userId, chatId, res))) return;
    const result = await query(
      `SELECT u.id, u.name
       FROM typing_sessions ts
       JOIN users u ON u.id = ts.user_id
       WHERE ts.chat_id = $1 AND ts.user_id != $2 AND ts.updated_at > NOW() - INTERVAL '4 seconds'`,
      [chatId, session.userId],
    );
    res.json({ success: true, typing: result.rows });
  } catch (err) {
    req.log.error({ err }, "web get typing error");
    res.status(500).json({ success: false, typing: [] });
  }
});

router.delete("/:token/chats/:chatId/messages/:messageId", async (req: Request, res: Response) => {
  const chatId = routeParam(req.params.chatId);
  const messageId = routeParam(req.params.messageId);
  try {
    const session = await requireLinkedSession(req, res);
    if (!session || !(await requireChatMember(session.userId, chatId, res))) return;
    const result = await query(
      "UPDATE messages SET is_deleted = TRUE, content = 'This message was deleted', media_url = NULL WHERE id = $1 AND chat_id = $2 AND sender_id = $3 RETURNING id",
      [messageId, chatId, session.userId],
    );
    if (!result.rows[0]) {
      res.status(404).json({ success: false, message: "Message not found" });
      return;
    }
    publishForChat("message", chatId, await getChatMemberIds(chatId), { messageId, deleted: true });
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "web delete message error");
    res.status(500).json({ success: false });
  }
});

router.post("/:token/chats/:chatId/messages/:messageId/star", async (req: Request, res: Response) => {
  const chatId = routeParam(req.params.chatId);
  const messageId = routeParam(req.params.messageId);
  try {
    const session = await requireLinkedSession(req, res);
    if (!session || !(await requireChatMember(session.userId, chatId, res))) return;
    const result = await query(
      "UPDATE messages SET is_starred = NOT is_starred WHERE id = $1 AND chat_id = $2 RETURNING is_starred",
      [messageId, chatId],
    );
    if (!result.rows[0]) {
      res.status(404).json({ success: false, message: "Message not found" });
      return;
    }
    publishForChat("message", chatId, await getChatMemberIds(chatId), { messageId, starred: result.rows[0].is_starred });
    res.json({ success: true, isStarred: result.rows[0].is_starred });
  } catch (err) {
    req.log.error({ err }, "web star message error");
    res.status(500).json({ success: false });
  }
});

router.post("/:token/chats/:chatId/messages/:messageId/react", async (req: Request, res: Response) => {
  const chatId = routeParam(req.params.chatId);
  const messageId = routeParam(req.params.messageId);
  const { emoji } = req.body as { emoji?: string };
  if (!emoji) {
    res.status(400).json({ success: false, message: "emoji is required" });
    return;
  }
  try {
    const session = await requireLinkedSession(req, res);
    if (!session || !(await requireChatMember(session.userId, chatId, res))) return;
    const existing = await query("SELECT emoji FROM message_reactions WHERE message_id = $1 AND user_id = $2", [messageId, session.userId]);
    if (existing.rows.length > 0 && existing.rows[0].emoji === emoji) {
      await query("DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2", [messageId, session.userId]);
    } else {
      await query(
        `INSERT INTO message_reactions (message_id, user_id, emoji)
         VALUES ($1, $2, $3)
         ON CONFLICT (message_id, user_id) DO UPDATE SET emoji = $3, created_at = NOW()`,
        [messageId, session.userId, emoji],
      );
    }
    publishForChat("message", chatId, await getChatMemberIds(chatId), { messageId, reaction: emoji });
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "web react message error");
    res.status(500).json({ success: false });
  }
});

router.get("/:token/chats/:chatId/details", async (req: Request, res: Response) => {
  const chatId = routeParam(req.params.chatId);
  try {
    const session = await requireLinkedSession(req, res);
    if (!session || !(await requireChatMember(session.userId, chatId, res))) return;
    const chat = await query(
      `SELECT id, is_group, group_name, group_avatar_url, group_description, disappear_after_seconds,
              COALESCE(NULLIF(TRIM(group_messaging_policy), ''), 'everyone') AS group_messaging_policy
       FROM chats WHERE id = $1`,
      [chatId],
    );
    const members = await query(
      `SELECT u.id, u.name, u.phone, u.avatar_url, u.about, u.is_online, u.last_seen,
              cm.is_admin, cm.joined_at, COALESCE(cm.can_send_messages, TRUE) AS can_send_messages
       FROM chat_members cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.chat_id = $1
       ORDER BY cm.is_admin DESC, u.name ASC`,
      [chatId],
    );
    res.json({ success: true, chat: chat.rows[0], members: members.rows });
  } catch (err) {
    req.log.error({ err }, "web chat details error");
    res.status(500).json({ success: false });
  }
});

router.patch("/:token/chats/:chatId/mute", async (req: Request, res: Response) => {
  const chatId = routeParam(req.params.chatId);
  const { muted } = req.body as { muted?: boolean };
  if (typeof muted !== "boolean") {
    res.status(400).json({ success: false, message: "muted is required" });
    return;
  }
  try {
    const session = await requireLinkedSession(req, res);
    if (!session || !(await requireChatMember(session.userId, chatId, res))) return;
    const result = await query(
      "UPDATE chat_members SET is_muted = $1 WHERE chat_id = $2 AND user_id = $3 RETURNING is_muted",
      [muted, chatId, session.userId],
    );
    res.json({ success: true, isMuted: result.rows[0]?.is_muted ?? muted });
  } catch (err) {
    req.log.error({ err }, "web mute chat error");
    res.status(500).json({ success: false });
  }
});

router.patch("/:token/chats/:chatId/archive", async (req: Request, res: Response) => {
  const chatId = routeParam(req.params.chatId);
  const { archived } = req.body as { archived?: boolean };
  try {
    const session = await requireLinkedSession(req, res);
    if (!session || !(await requireChatMember(session.userId, chatId, res))) return;
    await query("ALTER TABLE chat_members ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE");
    const result = await query(
      "UPDATE chat_members SET is_archived = $1 WHERE chat_id = $2 AND user_id = $3 RETURNING is_archived",
      [Boolean(archived), chatId, session.userId],
    );
    publishForChat("archive", chatId, [session.userId], { archived: result.rows[0]?.is_archived ?? Boolean(archived) });
    res.json({ success: true, isArchived: result.rows[0]?.is_archived ?? Boolean(archived) });
  } catch (err) {
    req.log.error({ err }, "web archive chat error");
    res.status(500).json({ success: false });
  }
});

router.get("/user/:userId/devices", async (req: Request, res: Response) => {
  const rawUserId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const userId = parseInt(rawUserId ?? "", 10);
  if (isNaN(userId)) {
    res.status(400).json({ success: false });
    return;
  }

  try {
    const result = await query(
      `SELECT token, device_name, platform, linked_at, last_active
       FROM web_sessions
       WHERE user_id = $1 AND status = 'linked' AND expires_at > NOW()
       ORDER BY linked_at DESC`,
      [userId],
    );
    res.json({ success: true, devices: result.rows });
  } catch (err) {
    req.log.error({ err }, "list devices error");
    res.status(500).json({ success: false });
  }
});

router.delete("/:token", async (req: Request, res: Response) => {
  try {
    await query("UPDATE web_sessions SET status = 'expired' WHERE token = $1", [routeParam(req.params.token)]);
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "delete device error");
    res.status(500).json({ success: false });
  }
});

router.patch("/:token/name", async (req: Request, res: Response) => {
  const token = routeParam(req.params.token);
  const { name } = req.body as { name?: string };
  if (!name?.trim()) {
    res.status(400).json({ success: false, message: "name required" });
    return;
  }
  try {
    await query("UPDATE web_sessions SET device_name = $1 WHERE token = $2 AND status = 'linked'", [name.trim(), token]);
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "rename device error");
    res.status(500).json({ success: false });
  }
});

export default router;

import { Router, type Request, type Response } from "express";
import { query } from "../lib/db";
import { isExpoPushToken, sendExpoChatPush } from "../lib/expoPush";
import { enforceModerationForActivity } from "../lib/moderation";
import { enforceGroupCreationPolicy } from "../lib/groupCreationPolicy";

const router = Router();

type GroupSendEval = {
  ok: boolean;
  code?: "not_member" | "admins_only" | "allowlist";
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
  const r = await query(
    `SELECT c.is_group,
            COALESCE(NULLIF(TRIM(c.group_messaging_policy), ''), 'everyone') AS policy,
            cm.is_admin,
            COALESCE(cm.can_send_messages, TRUE) AS can_send_messages
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
  if (!isGroup) return { ok: true, policy: "everyone", isGroup: false, isAdmin: false };
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

// Get all chats for a user
router.get("/user/:userId", async (req: Request, res: Response) => {
  const { userId } = req.params;
  try {
    const result = await query(`
      SELECT
        c.id,
        c.is_group,
        c.group_name,
        c.group_avatar_url,
        c.disappear_after_seconds,
        cm.is_muted,
        cm.is_pinned,
        cm.last_read_at,
        (
          SELECT json_build_object(
            'id', m.id,
            'content', m.content,
            'type', m.type,
            'sender_id', m.sender_id,
            'created_at', m.created_at,
            'is_deleted', m.is_deleted
          )
          FROM messages m
          WHERE m.chat_id = c.id AND m.is_deleted = FALSE
          ORDER BY m.created_at DESC
          LIMIT 1
        ) AS last_message,
        (
          SELECT COUNT(*)::int
          FROM messages m
          WHERE m.chat_id = c.id
            AND m.sender_id != $1::int
            AND m.created_at > cm.last_read_at
            AND m.is_deleted = FALSE
        ) AS unread_count,
        (
          SELECT json_agg(json_build_object(
            'id', u.id, 'name', u.name, 'phone', u.phone,
            'avatar_url', u.avatar_url, 'is_online', u.is_online
          ))
          FROM chat_members cm2
          JOIN users u ON u.id = cm2.user_id
          WHERE cm2.chat_id = c.id AND cm2.user_id != $1::int
        ) AS other_members
      FROM chats c
      JOIN chat_members cm ON cm.chat_id = c.id AND cm.user_id = $1::int
      ORDER BY (
        SELECT created_at FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1
      ) DESC NULLS LAST
    `, [userId]);

    res.json({ success: true, chats: result.rows });
  } catch (err) {
    req.log.error({ err }, "get chats error");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Get or create a direct chat between two users
router.post("/direct", async (req: Request, res: Response) => {
  const { userId, otherUserId } = req.body as { userId?: number; otherUserId?: number };
  if (!userId || !otherUserId) { res.status(400).json({ success: false }); return; }
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

    const chat = await query("INSERT INTO chats (is_group) VALUES (FALSE) RETURNING id", []);
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
      "INSERT INTO chats (is_group, group_name, group_avatar_url, group_description, created_by) VALUES (TRUE, $1, $2, $3, $4) RETURNING id",
      [trimmedName, groupAvatarUrl ?? null, description ?? null, creatorId]
    );
    const chatId = chat.rows[0].id;
    const allMembers = Array.from(new Set([creatorId, ...memberIds]));
    for (const memberId of allMembers) {
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

// Get messages in a chat (with read status, reactions, forward_count)
router.get("/:chatId/messages", async (req: Request, res: Response) => {
  const { chatId } = req.params;
  const userId = req.query.userId as string | undefined;
  const limit = Number(req.query.limit ?? 50);
  const before = req.query.before as string | undefined;
  try {
    const result = await query(`
      SELECT
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
      LIMIT $2
    `, before ? [chatId, limit, before] : [chatId, limit]);

    res.json({ success: true, messages: result.rows.reverse() });
  } catch (err) {
    req.log.error({ err }, "get messages error");
    res.status(500).json({ success: false });
  }
});

// Typing indicator – set
router.post("/:chatId/typing", async (req: Request, res: Response) => {
  const { chatId } = req.params;
  const { userId } = req.body as { userId?: number };
  if (!userId) { res.status(400).json({ success: false }); return; }
  try {
    await query(
      `INSERT INTO typing_sessions (chat_id, user_id, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (chat_id, user_id) DO UPDATE SET updated_at = NOW()`,
      [chatId, userId]
    );
    res.json({ success: true });
  } catch { res.json({ success: false }); }
});

// Typing indicator – clear
router.delete("/:chatId/typing", async (req: Request, res: Response) => {
  const { chatId } = req.params;
  const { userId } = req.body as { userId?: number };
  if (!userId) { res.json({ success: false }); return; }
  try {
    await query("DELETE FROM typing_sessions WHERE chat_id = $1 AND user_id = $2", [chatId, userId]);
    res.json({ success: true });
  } catch { res.json({ success: false }); }
});

// Typing indicator – get
router.get("/:chatId/typing", async (req: Request, res: Response) => {
  const { chatId } = req.params;
  const { userId } = req.query as { userId?: string };
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
  try {
    const perm = await evaluateGroupSendPermission(chatId, userId);
    if (!perm) {
      res.status(404).json({ success: false });
      return;
    }
    res.json({
      success: true,
      policy: perm.policy,
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
  const { senderId, content, type, replyToId, mediaUrl, isForwarded, forwardCount, isViewOnce } = req.body as {
    senderId?: number; content?: string; type?: string; replyToId?: number;
    mediaUrl?: string; isForwarded?: boolean; forwardCount?: number; isViewOnce?: boolean;
  };
  if (!senderId || !content) { res.status(400).json({ success: false }); return; }
  try {
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

    const result = await query(`
      INSERT INTO messages (chat_id, sender_id, content, type, reply_to_id, media_url, is_forwarded, forward_count, is_view_once)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [chatId, senderId, content, type ?? "text", replyToId ?? null, mediaUrl ?? null,
        isForwarded ?? false, forwardCount ?? 0, isViewOnce ?? false]);

    // Mark as delivered for all other members + gather push tokens
    const members = await query(
      "SELECT u.id AS user_id, u.push_token, u.name FROM chat_members cm JOIN users u ON u.id = cm.user_id WHERE cm.chat_id = $1 AND cm.user_id != $2",
      [chatId, senderId]
    );
    for (const member of members.rows) {
      await query(
        "INSERT INTO message_status (message_id, user_id, status) VALUES ($1, $2, 'delivered') ON CONFLICT (message_id, user_id) DO UPDATE SET status = 'delivered', updated_at = NOW()",
        [result.rows[0].id, member.user_id]
      );
    }

    // Send push notifications (fire and forget)
    const senderRow = await query("SELECT name FROM users WHERE id = $1", [senderId]);
    const senderName = senderRow.rows[0]?.name ?? "Videh";
    const tokens = members.rows.map((m: any) => m.push_token).filter(isExpoPushToken);
    if (tokens.length > 0) {
      const preview = (content ?? "").length > 60 ? content!.slice(0, 60) + "..." : (content ?? "");
      sendExpoChatPush(tokens, senderName, preview, { chatId, type: "message" });
    }

    res.json({ success: true, message: result.rows[0] });
  } catch (err) {
    req.log.error({ err }, "send message error");
    res.status(500).json({ success: false });
  }
});

// Delete message (for me OR for everyone)
router.delete("/:chatId/messages/:messageId", async (req: Request, res: Response) => {
  const { messageId } = req.params;
  const { userId, deleteForEveryone } = req.body as { userId?: number; deleteForEveryone?: boolean };
  try {
    if (deleteForEveryone) {
      await query(
        "UPDATE messages SET is_deleted = TRUE, content = 'This message was deleted', media_url = NULL WHERE id = $1 AND sender_id = $2",
        [messageId, userId]
      );
    } else {
      // Just soft-delete for sender — in real app you'd track per-user deletes; we do same for simplicity
      await query(
        "UPDATE messages SET is_deleted = TRUE, content = 'This message was deleted' WHERE id = $1 AND sender_id = $2",
        [messageId, userId]
      );
    }
    res.json({ success: true, deleteForEveryone: !!deleteForEveryone });
  } catch (err) {
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
  const hasContent = typeof content === "string";
  const hasMedia = typeof mediaUrl === "string";
  if (!hasContent && !hasMedia) {
    res.status(400).json({ success: false });
    return;
  }
  try {
    if (hasContent && hasMedia) {
      await query(
        "UPDATE messages SET content = $1, media_url = $2, edited_at = NOW() WHERE id = $3 AND sender_id = $4 AND is_deleted = FALSE",
        [content, mediaUrl, messageId, userId]
      );
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
  const { messageId } = req.params;
  try {
    const result = await query(
      "UPDATE messages SET is_starred = NOT is_starred WHERE id = $1 RETURNING is_starred",
      [messageId]
    );
    res.json({ success: true, isStarred: result.rows[0]?.is_starred });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// React to message
router.post("/:chatId/messages/:messageId/react", async (req: Request, res: Response) => {
  const { messageId } = req.params;
  const { userId, emoji } = req.body as { userId?: number; emoji?: string };
  if (!userId || !emoji) { res.status(400).json({ success: false }); return; }
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

// Mark chat as read (also updates message_status to 'read')
router.post("/:chatId/read", async (req: Request, res: Response) => {
  const { chatId } = req.params;
  const { userId } = req.body as { userId?: number };
  try {
    await query(
      "UPDATE chat_members SET last_read_at = NOW() WHERE chat_id = $1 AND user_id = $2",
      [chatId, userId]
    );
    // Mark all messages in this chat (not sent by user) as 'read'
    await query(`
      INSERT INTO message_status (message_id, user_id, status, updated_at)
      SELECT m.id, $2, 'read', NOW()
      FROM messages m
      WHERE m.chat_id = $1 AND m.sender_id != $2
      ON CONFLICT (message_id, user_id) DO UPDATE SET status = 'read', updated_at = NOW()
    `, [chatId, userId]);
    res.json({ success: true });
  } catch (err) {
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
  try {
    const result = await query(`
      SELECT id, is_group, group_name, group_avatar_url, group_description, disappear_after_seconds,
             COALESCE(NULLIF(TRIM(group_messaging_policy), ''), 'everyone') AS group_messaging_policy
      FROM chats WHERE id = $1
    `, [chatId]);
    if (result.rows.length === 0) { res.status(404).json({ success: false }); return; }
    res.json({ success: true, chat: result.rows[0] });
  } catch { res.status(500).json({ success: false }); }
});

// Get group members (with real data)
router.get("/:chatId/members", async (req: Request, res: Response) => {
  const { chatId } = req.params;
  try {
    const result = await query(`
      SELECT u.id, u.name, u.phone, u.avatar_url, u.about, u.is_online, u.last_seen,
             cm.is_admin, cm.joined_at, COALESCE(cm.can_send_messages, TRUE) AS can_send_messages
      FROM chat_members cm JOIN users u ON u.id = cm.user_id
      WHERE cm.chat_id = $1
      ORDER BY cm.is_admin DESC, u.name ASC
    `, [chatId]);
    res.json({ success: true, members: result.rows });
  } catch { res.status(500).json({ success: false }); }
});

// Add member to group
router.post("/:chatId/members", async (req: Request, res: Response) => {
  const { chatId } = req.params;
  const { userId, requesterId } = req.body as { userId?: number; requesterId?: number };
  if (!userId) { res.status(400).json({ success: false }); return; }
  try {
    // Check requester is admin
    const adminCheck = await query("SELECT is_admin FROM chat_members WHERE chat_id = $1 AND user_id = $2", [chatId, requesterId]);
    if (!adminCheck.rows[0]?.is_admin) { res.status(403).json({ success: false, message: "Not admin" }); return; }
    const pol = await query(
      `SELECT COALESCE(NULLIF(TRIM(group_messaging_policy), ''), 'everyone') AS policy FROM chats WHERE id = $1`,
      [chatId],
    );
    const policy = String(pol.rows[0]?.policy || "everyone");
    const canSendDefault = policy !== "allowlist";
    await query(
      "INSERT INTO chat_members (chat_id, user_id, can_send_messages) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
      [chatId, userId, canSendDefault],
    );
    res.json({ success: true });
  } catch { res.status(500).json({ success: false }); }
});

// Remove member from group
router.delete("/:chatId/members/:memberId", async (req: Request, res: Response) => {
  const { chatId, memberId } = req.params;
  const { requesterId } = req.body as { requesterId?: number };
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
  try {
    const adminCheck = await query("SELECT is_admin FROM chat_members WHERE chat_id = $1 AND user_id = $2", [chatId, requesterId]);
    if (!adminCheck.rows[0]?.is_admin) { res.status(403).json({ success: false }); return; }
    await query("UPDATE chat_members SET is_admin = $1 WHERE chat_id = $2 AND user_id = $3", [isAdmin ?? true, chatId, memberId]);
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

// Update group description
router.put("/:chatId/description", async (req: Request, res: Response) => {
  const { chatId } = req.params;
  const { description, requesterId } = req.body as { description?: string; requesterId?: number };
  try {
    await query("UPDATE chats SET group_description = $1 WHERE id = $2", [description ?? null, chatId]);
    res.json({ success: true });
  } catch { res.status(500).json({ success: false }); }
});

// Set disappearing messages
router.put("/:chatId/disappear", async (req: Request, res: Response) => {
  const { chatId } = req.params;
  const { seconds } = req.body as { seconds?: number | null };
  try {
    await query("UPDATE chats SET disappear_after_seconds = $1 WHERE id = $2", [seconds ?? null, chatId]);
    res.json({ success: true });
  } catch { res.status(500).json({ success: false }); }
});

// Message info (delivery/read status for each recipient)
router.get("/:chatId/messages/:messageId/info", async (req: Request, res: Response) => {
  const { messageId } = req.params;
  try {
    const result = await query(`
      SELECT ms.user_id, ms.status, ms.updated_at, u.name, u.avatar_url
      FROM message_status ms JOIN users u ON u.id = ms.user_id
      WHERE ms.message_id = $1
      ORDER BY CASE ms.status WHEN 'read' THEN 0 WHEN 'delivered' THEN 1 ELSE 2 END, u.name
    `, [messageId]);
    res.json({ success: true, receipts: result.rows });
  } catch { res.status(500).json({ success: false }); }
});

export default router;

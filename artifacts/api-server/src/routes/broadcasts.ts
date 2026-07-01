import { Router, type Request, type Response } from "express";
import { assertSameUser, getAuthUserId, requireAuth } from "../lib/auth";
import { query } from "../lib/db";
import { EXPO_CHAT_MESSAGE_CATEGORY_ID } from "../lib/expoPush";
import { enforceModerationForActivity } from "../lib/moderation";
import { chatMessagePushPreview } from "../lib/chatMessagePreview";
import { isValidPushToken, sendChatPush } from "../lib/pushNotify";
import { publishChatEvent } from "../lib/realtime";

const router = Router();
router.use(requireAuth);

function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

async function assertListOwner(req: Request, res: Response, listId: string): Promise<number | null> {
  const authUserId = getAuthUserId(req);
  if (!authUserId) {
    res.status(401).json({ success: false, message: "Authentication required" });
    return null;
  }
  const result = await query("SELECT creator_id FROM broadcast_lists WHERE id = $1", [listId]);
  if (result.rows.length === 0) {
    res.status(404).json({ success: false, message: "Broadcast list not found" });
    return null;
  }
  const creatorId = Number(result.rows[0].creator_id);
  if (creatorId !== authUserId) {
    res.status(403).json({ success: false, message: "Not authorized" });
    return null;
  }
  return creatorId;
}

async function isDirectChatBlocked(chatId: number, senderId: number): Promise<boolean> {
  const r = await query(
    `SELECT EXISTS(
      SELECT 1
      FROM chats c
      JOIN chat_members me ON me.chat_id = c.id AND me.user_id = $2
      JOIN chat_members other ON other.chat_id = c.id AND other.user_id != $2
      JOIN blocked_users b
        ON (b.blocker_id = me.user_id AND b.blocked_id = other.user_id)
        OR (b.blocker_id = other.user_id AND b.blocked_id = me.user_id)
      WHERE c.id = $1 AND c.is_group = FALSE
    ) AS blocked`,
    [chatId, senderId],
  );
  return Boolean(r.rows[0]?.blocked);
}

router.get("/user/:userId", async (req: Request, res: Response) => {
  const userId = Number(routeParam(req.params.userId));
  if (!userId || !assertSameUser(req, res, userId)) return;
  try {
    const result = await query(
      `SELECT bl.*, COUNT(br.user_id)::int as recipient_count
       FROM broadcast_lists bl
       LEFT JOIN broadcast_recipients br ON br.list_id = bl.id
       WHERE bl.creator_id = $1
       GROUP BY bl.id ORDER BY bl.created_at DESC`,
      [userId],
    );
    res.json({ success: true, lists: result.rows });
  } catch (err) {
    req.log.error({ err }, "get broadcasts error");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/", async (req: Request, res: Response) => {
  const authUserId = getAuthUserId(req);
  if (!authUserId) {
    res.status(401).json({ success: false, message: "Authentication required" });
    return;
  }
  const { name } = req.body as { name?: string };
  if (!name?.trim()) {
    res.status(400).json({ success: false, message: "name required" });
    return;
  }
  try {
    const result = await query(
      "INSERT INTO broadcast_lists (creator_id, name) VALUES ($1,$2) RETURNING *",
      [authUserId, name.trim()],
    );
    res.json({ success: true, list: result.rows[0] });
  } catch (err) {
    req.log.error({ err }, "create broadcast error");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/:listId/recipients", async (req: Request, res: Response) => {
  const listId = routeParam(req.params.listId);
  if (!(await assertListOwner(req, res, listId))) return;
  try {
    const result = await query(
      `SELECT br.*, u.name, u.phone, u.avatar_url, u.is_online
       FROM broadcast_recipients br
       JOIN users u ON u.id = br.user_id
       WHERE br.list_id = $1`,
      [listId],
    );
    res.json({ success: true, recipients: result.rows });
  } catch (err) {
    req.log.error({ err }, "get broadcast recipients error");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/:listId/recipients", async (req: Request, res: Response) => {
  const listId = routeParam(req.params.listId);
  if (!(await assertListOwner(req, res, listId))) return;
  const { userId } = req.body as { userId?: number };
  if (!userId) {
    res.status(400).json({ success: false, message: "userId required" });
    return;
  }
  try {
    await query(
      "INSERT INTO broadcast_recipients (list_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
      [listId, userId],
    );
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "add broadcast recipient error");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.delete("/:listId/recipients/:userId", async (req: Request, res: Response) => {
  const listId = routeParam(req.params.listId);
  const recipientUserId = routeParam(req.params.userId);
  if (!(await assertListOwner(req, res, listId))) return;
  try {
    await query("DELETE FROM broadcast_recipients WHERE list_id=$1 AND user_id=$2", [listId, recipientUserId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/:listId/send", async (req: Request, res: Response) => {
  const listId = routeParam(req.params.listId);
  const authUserId = getAuthUserId(req);
  if (!authUserId) {
    res.status(401).json({ success: false, message: "Authentication required" });
    return;
  }
  const { content, type = "text", mediaUrl } = req.body as {
    content?: string;
    type?: string;
    mediaUrl?: string | null;
  };
  if (!content) {
    res.status(400).json({ success: false, message: "content required" });
    return;
  }
  try {
    const mod = await enforceModerationForActivity(authUserId, "broadcast", {
      content,
      mediaUrl: mediaUrl ?? null,
      type,
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

    const listResult = await query(
      "SELECT * FROM broadcast_lists WHERE id=$1 AND creator_id=$2",
      [listId, authUserId],
    );
    if (listResult.rows.length === 0) {
      res.status(403).json({ success: false, message: "Not authorized" });
      return;
    }

    const recipients = await query(
      `SELECT br.user_id, u.push_token
       FROM broadcast_recipients br
       JOIN users u ON u.id = br.user_id
       WHERE br.list_id = $1`,
      [listId],
    );
    const sender = await query("SELECT name FROM users WHERE id=$1", [authUserId]);
    const senderName = sender.rows[0]?.name ?? "Videh";

    let sentCount = 0;
    for (const r of recipients.rows) {
      const recipientId = Number(r.user_id);
      if (!recipientId) continue;

      const existingChat = await query(
        `SELECT c.id FROM chats c
         JOIN chat_members cm1 ON cm1.chat_id = c.id AND cm1.user_id = $1
         JOIN chat_members cm2 ON cm2.chat_id = c.id AND cm2.user_id = $2
         WHERE c.is_group = FALSE LIMIT 1`,
        [authUserId, recipientId],
      );
      let chatId: number;
      if (existingChat.rows.length > 0) {
        chatId = existingChat.rows[0].id;
      } else {
        const newChat = await query("INSERT INTO chats (is_group) VALUES (FALSE) RETURNING id", []);
        chatId = newChat.rows[0].id;
        await query("INSERT INTO chat_members (chat_id, user_id) VALUES ($1,$2),($1,$3)", [chatId, authUserId, recipientId]);
      }

      if (await isDirectChatBlocked(chatId, authUserId)) continue;

      const msgResult = await query(
        "INSERT INTO messages (chat_id, sender_id, content, type, media_url) VALUES ($1,$2,$3,$4,$5) RETURNING *",
        [chatId, authUserId, content, type, mediaUrl ?? null],
      );
      const message = msgResult.rows[0];
      const messageId = Number(message.id);

      const muteRow = await query(
        "SELECT is_muted FROM chat_members WHERE chat_id = $1 AND user_id = $2",
        [chatId, recipientId],
      );
      const isMuted = Boolean(muteRow.rows[0]?.is_muted);
      const pushToken = r.push_token;
      const tokens = typeof pushToken === "string" && isValidPushToken(pushToken) ? [pushToken] : [];
      if (!isMuted && tokens.length > 0) {
        const preview = chatMessagePushPreview(type, content);
        await sendChatPush(
          tokens,
          senderName,
          preview,
          {
            chatId: String(chatId),
            messageId: String(messageId),
            senderId: String(authUserId),
            senderName,
            messageType: type,
            type: "message",
            notificationKind: "chat_message",
          },
          { categoryId: EXPO_CHAT_MESSAGE_CATEGORY_ID, threadId: `chat-${chatId}` },
        );
      }

      publishChatEvent({
        type: "message",
        chatId,
        userIds: [authUserId, recipientId],
        payload: { message },
      });

      sentCount++;
    }
    res.json({ success: true, sentTo: sentCount });
  } catch (err) {
    req.log.error({ err }, "send broadcast error");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.delete("/:listId", async (req: Request, res: Response) => {
  const listId = routeParam(req.params.listId);
  if (!(await assertListOwner(req, res, listId))) return;
  try {
    await query("DELETE FROM broadcast_lists WHERE id=$1", [listId]);
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "delete broadcast error");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;

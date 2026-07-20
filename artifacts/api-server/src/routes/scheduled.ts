import { Router, type Request, type Response } from "express";
import { query } from "../lib/db";
import { assertSameUser, getAuthUserId, requireAuth } from "../lib/auth";

const router = Router();

async function isChatMember(chatId: number, userId: number): Promise<boolean> {
  const r = await query(
    "SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2 LIMIT 1",
    [chatId, userId],
  );
  return r.rows.length > 0;
}

// Schedule a message
router.post("/", requireAuth, async (req: Request, res: Response) => {
  const { chatId, senderId, content, type = "text", replyToId, scheduledAt } = req.body as {
    chatId?: number;
    senderId?: number;
    content?: string;
    type?: string;
    replyToId?: number;
    scheduledAt?: string;
  };
  if (!chatId || !senderId || !content || !scheduledAt) {
    res.status(400).json({ success: false, message: "chatId, senderId, content, scheduledAt required" });
    return;
  }
  if (!assertSameUser(req, res, senderId)) return;
  try {
    if (!(await isChatMember(Number(chatId), Number(senderId)))) {
      res.status(403).json({ success: false, message: "Not a member of this chat" });
      return;
    }
    const result = await query(
      `INSERT INTO scheduled_messages (chat_id, sender_id, content, type, reply_to_id, scheduled_at)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [chatId, senderId, content, type, replyToId ?? null, new Date(scheduledAt)],
    );
    res.json({ success: true, message: result.rows[0] });
  } catch (err) {
    req.log.error({ err }, "schedule message error");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// List scheduled messages for a chat
router.get("/chat/:chatId", requireAuth, async (req: Request, res: Response) => {
  const { chatId } = req.params;
  const authUserId = getAuthUserId(req);
  if (!authUserId) {
    res.status(401).json({ success: false, message: "Authentication required" });
    return;
  }
  try {
    if (!(await isChatMember(Number(chatId), authUserId))) {
      res.status(403).json({ success: false, message: "Not a member of this chat" });
      return;
    }
    const result = await query(
      `SELECT sm.*, u.name as sender_name FROM scheduled_messages sm
       JOIN users u ON u.id = sm.sender_id
       WHERE sm.chat_id = $1 AND sm.sent = FALSE
       ORDER BY sm.scheduled_at ASC`,
      [chatId],
    );
    res.json({ success: true, messages: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Cancel a scheduled message (only the sender)
router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  const authUserId = getAuthUserId(req);
  if (!authUserId) {
    res.status(401).json({ success: false, message: "Authentication required" });
    return;
  }
  try {
    const existing = await query(
      "SELECT id, sender_id FROM scheduled_messages WHERE id = $1 AND sent = FALSE",
      [req.params.id],
    );
    if (!existing.rows[0]) {
      res.status(404).json({ success: false, message: "Scheduled message not found" });
      return;
    }
    if (Number(existing.rows[0].sender_id) !== authUserId) {
      res.status(403).json({ success: false, message: "Cannot cancel another user's scheduled message" });
      return;
    }
    await query("DELETE FROM scheduled_messages WHERE id = $1 AND sent = FALSE", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;

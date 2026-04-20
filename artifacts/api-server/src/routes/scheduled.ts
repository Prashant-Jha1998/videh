import { Router, type Request, type Response } from "express";
import { query } from "../lib/db";

const router = Router();

// Schedule a message
router.post("/", async (req: Request, res: Response) => {
  const { chatId, senderId, content, type = "text", replyToId, scheduledAt } = req.body as any;
  if (!chatId || !senderId || !content || !scheduledAt) {
    res.status(400).json({ success: false, message: "chatId, senderId, content, scheduledAt required" });
    return;
  }
  try {
    const result = await query(
      `INSERT INTO scheduled_messages (chat_id, sender_id, content, type, reply_to_id, scheduled_at)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [chatId, senderId, content, type, replyToId ?? null, new Date(scheduledAt)]
    );
    res.json({ success: true, message: result.rows[0] });
  } catch (err) {
    req.log.error({ err }, "schedule message error");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// List scheduled messages for a chat
router.get("/chat/:chatId", async (req: Request, res: Response) => {
  const { chatId } = req.params;
  try {
    const result = await query(
      `SELECT sm.*, u.name as sender_name FROM scheduled_messages sm
       JOIN users u ON u.id = sm.sender_id
       WHERE sm.chat_id = $1 AND sm.sent = FALSE
       ORDER BY sm.scheduled_at ASC`,
      [chatId]
    );
    res.json({ success: true, messages: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Cancel a scheduled message
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    await query("DELETE FROM scheduled_messages WHERE id = $1 AND sent = FALSE", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;

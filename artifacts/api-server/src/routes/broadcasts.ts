import { Router, type Request, type Response } from "express";
import { query } from "../lib/db";

const router = Router();

// Get all broadcast lists for a user
router.get("/user/:userId", async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT bl.*, COUNT(br.id)::int as recipient_count
       FROM broadcast_lists bl
       LEFT JOIN broadcast_recipients br ON br.list_id = bl.id
       WHERE bl.creator_id = $1
       GROUP BY bl.id ORDER BY bl.created_at DESC`,
      [req.params.userId]
    );
    res.json({ success: true, lists: result.rows });
  } catch (err) {
    req.log.error({ err }, "get broadcasts error");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Create broadcast list
router.post("/", async (req: Request, res: Response) => {
  const { creatorId, name } = req.body as any;
  if (!creatorId || !name) { res.status(400).json({ success: false, message: "creatorId and name required" }); return; }
  try {
    const result = await query(
      "INSERT INTO broadcast_lists (creator_id, name) VALUES ($1,$2) RETURNING *",
      [creatorId, name]
    );
    res.json({ success: true, list: result.rows[0] });
  } catch (err) {
    req.log.error({ err }, "create broadcast error");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Get recipients of a broadcast list
router.get("/:listId/recipients", async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT br.*, u.name, u.phone, u.avatar_url, u.is_online
       FROM broadcast_recipients br
       JOIN users u ON u.id = br.user_id
       WHERE br.list_id = $1`,
      [req.params.listId]
    );
    res.json({ success: true, recipients: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Add recipient to broadcast list
router.post("/:listId/recipients", async (req: Request, res: Response) => {
  const { userId } = req.body as any;
  if (!userId) { res.status(400).json({ success: false, message: "userId required" }); return; }
  try {
    await query(
      "INSERT INTO broadcast_recipients (list_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
      [req.params.listId, userId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Remove recipient
router.delete("/:listId/recipients/:userId", async (req: Request, res: Response) => {
  try {
    await query("DELETE FROM broadcast_recipients WHERE list_id=$1 AND user_id=$2", [req.params.listId, req.params.userId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Send broadcast message — creates individual chats and sends to each recipient
router.post("/:listId/send", async (req: Request, res: Response) => {
  const { senderId, content, type = "text", mediaUrl } = req.body as any;
  if (!senderId || !content) { res.status(400).json({ success: false, message: "senderId and content required" }); return; }
  try {
    const listResult = await query("SELECT * FROM broadcast_lists WHERE id=$1 AND creator_id=$2", [req.params.listId, senderId]);
    if (listResult.rows.length === 0) { res.status(403).json({ success: false, message: "Not authorized" }); return; }

    const recipients = await query(
      "SELECT br.user_id, u.push_token FROM broadcast_recipients br JOIN users u ON u.id=br.user_id WHERE br.list_id=$1",
      [req.params.listId]
    );
    const sender = await query("SELECT name FROM users WHERE id=$1", [senderId]);
    const senderName = sender.rows[0]?.name ?? "Videh";

    let sentCount = 0;
    for (const r of recipients.rows) {
      // Find or create 1-to-1 chat
      const existingChat = await query(
        `SELECT c.id FROM chats c
         JOIN chat_members cm1 ON cm1.chat_id = c.id AND cm1.user_id = $1
         JOIN chat_members cm2 ON cm2.chat_id = c.id AND cm2.user_id = $2
         WHERE c.is_group = FALSE LIMIT 1`,
        [senderId, r.user_id]
      );
      let chatId: number;
      if (existingChat.rows.length > 0) {
        chatId = existingChat.rows[0].id;
      } else {
        const newChat = await query("INSERT INTO chats (is_group) VALUES (FALSE) RETURNING id", []);
        chatId = newChat.rows[0].id;
        await query("INSERT INTO chat_members (chat_id, user_id) VALUES ($1,$2),($1,$3)", [chatId, senderId, r.user_id]);
      }
      await query(
        "INSERT INTO messages (chat_id, sender_id, content, type, media_url) VALUES ($1,$2,$3,$4,$5)",
        [chatId, senderId, content, type, mediaUrl ?? null]
      );
      if (r.push_token?.startsWith("ExponentPushToken")) {
        fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: r.push_token, title: senderName, body: content.slice(0, 100), data: { chatId }, sound: "default" }),
        }).catch(() => {});
      }
      sentCount++;
    }
    res.json({ success: true, sentTo: sentCount });
  } catch (err) {
    req.log.error({ err }, "send broadcast error");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Delete broadcast list
router.delete("/:listId", async (req: Request, res: Response) => {
  try {
    await query("DELETE FROM broadcast_lists WHERE id=$1", [req.params.listId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;

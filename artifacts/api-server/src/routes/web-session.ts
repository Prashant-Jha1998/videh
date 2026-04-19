import { Router, type Request, type Response } from "express";
import { randomBytes } from "crypto";
import { query } from "../lib/db";

const router = Router();

// Create a new web session (web app calls this on load)
router.post("/", async (req: Request, res: Response) => {
  try {
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await query(
      "INSERT INTO web_sessions (token, status, expires_at) VALUES ($1, 'pending', $2)",
      [token, expiresAt]
    );

    res.json({ success: true, token, expiresAt: expiresAt.toISOString() });
  } catch (err) {
    req.log.error({ err }, "create web session error");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Mobile app calls this to link the session with a user
router.post("/:token/link", async (req: Request, res: Response) => {
  const { token } = req.params;
  const { userId } = req.body as { userId?: number };

  if (!userId) { res.status(400).json({ success: false, message: "userId required" }); return; }

  try {
    const sessionResult = await query(
      "SELECT * FROM web_sessions WHERE token = $1 AND status = 'pending' AND expires_at > NOW()",
      [token]
    );

    if (!sessionResult.rows.length) {
      res.status(404).json({ success: false, message: "Session not found or expired" });
      return;
    }

    await query(
      "UPDATE web_sessions SET status = 'linked', user_id = $1 WHERE token = $2",
      [userId, token]
    );

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "link web session error");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Web app polls this to check if QR was scanned
router.get("/:token/status", async (req: Request, res: Response) => {
  const { token } = req.params;

  try {
    const sessionResult = await query(
      `SELECT ws.status, ws.expires_at, ws.user_id,
              u.name, u.phone, u.about, u.avatar_url
       FROM web_sessions ws
       LEFT JOIN users u ON u.id = ws.user_id
       WHERE ws.token = $1`,
      [token]
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

// Web app fetches all chats for the linked user
router.get("/:token/chats", async (req: Request, res: Response) => {
  const { token } = req.params;

  try {
    const sessionResult = await query(
      "SELECT user_id FROM web_sessions WHERE token = $1 AND status = 'linked'",
      [token]
    );

    if (!sessionResult.rows.length) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const userId = sessionResult.rows[0].user_id;

    const chatsResult = await query(`
      SELECT
        c.id, c.is_group, c.group_name, c.group_avatar_url,
        cm.is_muted, cm.is_pinned,
        (
          SELECT json_build_object(
            'id', m.id, 'content', m.content, 'type', m.type,
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
            'id', u.id, 'name', u.name, 'phone', u.phone,
            'avatar_url', u.avatar_url, 'is_online', u.is_online
          ))
          FROM chat_members cm2 JOIN users u ON u.id = cm2.user_id
          WHERE cm2.chat_id = c.id AND cm2.user_id != $1::int
        ) AS other_members
      FROM chats c
      JOIN chat_members cm ON cm.chat_id = c.id AND cm.user_id = $1::int
      ORDER BY (SELECT created_at FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) DESC NULLS LAST
    `, [userId]);

    res.json({ success: true, chats: chatsResult.rows, userId });
  } catch (err) {
    req.log.error({ err }, "web session chats error");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Web app sends a message via linked session
router.post("/:token/messages", async (req: Request, res: Response) => {
  const { token } = req.params;
  const { chatId, content } = req.body as { chatId?: string; content?: string };

  if (!chatId || !content) { res.status(400).json({ success: false }); return; }

  try {
    const sessionResult = await query(
      "SELECT user_id FROM web_sessions WHERE token = $1 AND status = 'linked'",
      [token]
    );

    if (!sessionResult.rows.length) { res.status(401).json({ success: false }); return; }

    const userId = sessionResult.rows[0].user_id;

    const msgResult = await query(
      "INSERT INTO messages (chat_id, sender_id, content, type) VALUES ($1, $2, $3, 'text') RETURNING *",
      [chatId, userId, content]
    );

    res.json({ success: true, message: msgResult.rows[0] });
  } catch (err) {
    req.log.error({ err }, "web session send message error");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Web app fetches messages for a chat
router.get("/:token/chats/:chatId/messages", async (req: Request, res: Response) => {
  const { token, chatId } = req.params;

  try {
    const sessionResult = await query(
      "SELECT user_id FROM web_sessions WHERE token = $1 AND status = 'linked'",
      [token]
    );

    if (!sessionResult.rows.length) { res.status(401).json({ success: false }); return; }

    const result = await query(`
      SELECT m.id, m.chat_id, m.sender_id, m.content, m.type,
             m.is_deleted, m.is_starred, m.created_at,
             u.name AS sender_name, u.avatar_url AS sender_avatar
      FROM messages m
      LEFT JOIN users u ON u.id = m.sender_id
      WHERE m.chat_id = $1
      ORDER BY m.created_at DESC LIMIT 60
    `, [chatId]);

    res.json({ success: true, messages: result.rows.reverse() });
  } catch (err) {
    req.log.error({ err }, "web session messages error");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;

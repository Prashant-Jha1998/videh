import { randomBytes } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { assertSameUser, requireAuth } from "../lib/auth";
import { query } from "../lib/db";

const router = Router();
router.use(requireAuth);

function makeToken(): string {
  return randomBytes(16).toString("hex");
}

/** Create a shareable Videh call link (Videh). */
router.post("/", async (req: Request, res: Response) => {
  const hostId = Number((req as any).authUserId);
  const body = req.body as { chatId?: number; type?: string; title?: string; hoursValid?: number };
  if (!hostId) {
    res.status(401).json({ success: false });
    return;
  }
  const hours = Math.min(72, Math.max(1, Number(body.hoursValid ?? 24)));
  const token = makeToken();
  const callType = body.type === "audio" ? "audio" : "video";
  try {
    const r = await query(
      `INSERT INTO call_links (token, host_user_id, chat_id, call_type, title, expires_at)
       VALUES ($1, $2, $3, $4, $5, NOW() + ($6::text || ' hours')::interval)
       RETURNING token, call_type, title, expires_at`,
      [
        token,
        hostId,
        body.chatId ?? null,
        callType,
        String(body.title ?? "Videh call").slice(0, 120),
        String(hours),
      ],
    );
    const row = r.rows[0];
    const deepLink = `videh://join-call?token=${token}`;
    res.json({
      success: true,
      link: {
        token,
        callType: row.call_type,
        title: row.title,
        expiresAt: row.expires_at,
        deepLink,
        webPath: `/join-call?token=${token}`,
      },
    });
  } catch (err) {
    req.log?.error?.({ err }, "create call link");
    res.status(500).json({ success: false, message: "Could not create call link." });
  }
});

/** Resolve call link for join screen. */
router.get("/:token", async (req: Request, res: Response) => {
  const token = String(req.params.token ?? "").trim();
  if (!token) {
    res.status(400).json({ success: false });
    return;
  }
  try {
    const r = await query(
      `SELECT cl.*, u.name AS host_name, u.avatar_url AS host_avatar
       FROM call_links cl
       JOIN users u ON u.id = cl.host_user_id
       WHERE cl.token = $1 AND cl.expires_at > NOW()`,
      [token],
    );
    if (!r.rows[0]) {
      res.status(404).json({ success: false, message: "Link expired or invalid." });
      return;
    }
    const row = r.rows[0];
    res.json({
      success: true,
      link: {
        token: row.token,
        hostUserId: row.host_user_id,
        hostName: row.host_name,
        hostAvatar: row.host_avatar,
        chatId: row.chat_id,
        callType: row.call_type,
        title: row.title,
        expiresAt: row.expires_at,
      },
    });
  } catch (err) {
    req.log?.error?.({ err }, "get call link");
    res.status(500).json({ success: false });
  }
});

/** Join: start a call with the link host (creates/uses chat). */
router.post("/:token/join", async (req: Request, res: Response) => {
  const token = String(req.params.token ?? "").trim();
  const joinerId = Number((req as any).authUserId);
  if (!joinerId) {
    res.status(401).json({ success: false });
    return;
  }

  try {
    const linkRes = await query(
      `SELECT * FROM call_links WHERE token = $1 AND expires_at > NOW()`,
      [token],
    );
    const link = linkRes.rows[0];
    if (!link) {
      res.status(404).json({ success: false, message: "Link expired or invalid." });
      return;
    }
    const hostId = Number(link.host_user_id);
    let chatId = link.chat_id != null ? Number(link.chat_id) : null;

    if (!chatId) {
      const existing = await query(
        `SELECT c.id FROM chats c
         JOIN chat_members m1 ON m1.chat_id = c.id AND m1.user_id = $1
         JOIN chat_members m2 ON m2.chat_id = c.id AND m2.user_id = $2
         WHERE c.is_group = false
         LIMIT 1`,
        [hostId, joinerId],
      );
      if (existing.rows[0]) {
        chatId = Number(existing.rows[0].id);
      } else {
        const ins = await query(
          `INSERT INTO chats (is_group, name) VALUES (false, NULL) RETURNING id`,
        );
        chatId = Number(ins.rows[0].id);
        await query(
          `INSERT INTO chat_members (chat_id, user_id) VALUES ($1, $2), ($1, $3)`,
          [chatId, hostId, joinerId],
        );
      }
    }

    res.json({
      success: true,
      chatId,
      callType: link.call_type,
      hostUserId: hostId,
      message: "Open chat and start the call from the app.",
    });
  } catch (err) {
    req.log?.error?.({ err }, "join call link");
    res.status(500).json({ success: false });
  }
});

export default router;

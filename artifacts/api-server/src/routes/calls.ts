import { Router, type Request, type Response } from "express";
import { assertSameUser, requireAuth } from "../lib/auth";
import { query } from "../lib/db";

const router = Router();
router.use(requireAuth);

router.get("/user/:userId", async (req: Request, res: Response) => {
  const { userId } = req.params;
  if (!assertSameUser(req, res, userId)) return;
  try {
    const result = await query(`
      SELECT
        c.id, c.chat_id, c.type, c.status, c.started_at, c.ended_at, c.duration_seconds, c.created_at,
        CASE WHEN c.caller_id = $1::int THEN 'outgoing' ELSE 'incoming' END AS direction,
        CASE WHEN c.caller_id = $1::int THEN u2.id ELSE u1.id END AS other_user_id,
        CASE WHEN c.caller_id = $1::int THEN u2.name ELSE u1.name END AS other_user_name,
        CASE WHEN c.caller_id = $1::int THEN u2.avatar_url ELSE u1.avatar_url END AS other_user_avatar,
        CASE WHEN c.caller_id = $1::int THEN u2.phone ELSE u1.phone END AS other_user_phone
      FROM calls c
      JOIN users u1 ON u1.id = c.caller_id
      JOIN users u2 ON u2.id = c.callee_id
      WHERE c.caller_id = $1::int OR c.callee_id = $1::int
      ORDER BY c.created_at DESC
      LIMIT 50
    `, [userId]);
    res.json({ success: true, calls: result.rows });
  } catch (err) {
    req.log.error({ err }, "get calls error");
    res.status(500).json({ success: false });
  }
});

router.delete("/user/:userId", async (req: Request, res: Response) => {
  const { userId } = req.params;
  if (!assertSameUser(req, res, userId)) return;
  try {
    await query(
      `DELETE FROM calls WHERE caller_id = $1::int OR callee_id = $1::int`,
      [userId],
    );
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "clear calls error");
    res.status(500).json({ success: false });
  }
});

router.post("/", async (req: Request, res: Response) => {
  const { callerId, calleeId, type, status, durationSeconds, chatId } = req.body as {
    callerId?: number; calleeId?: number; type?: string;
    status?: string; durationSeconds?: number; chatId?: number;
  };
  const authUserId = Number((req as any).authUserId);
  if (!callerId || !calleeId || !assertSameUser(req, res, callerId)) return;
  if (authUserId !== Number(callerId)) {
    res.status(403).json({ success: false });
    return;
  }
  try {
    const result = await query(`
      INSERT INTO calls (caller_id, callee_id, chat_id, type, status, duration_seconds, started_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING *
    `, [callerId, calleeId, chatId ?? null, type ?? "audio", status ?? "missed", durationSeconds ?? 0]);
    res.json({ success: true, call: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

export default router;

import { Router, type Request, type Response } from "express";
import { query } from "../lib/db";

const router = Router();

// Get call logs for a user
router.get("/user/:userId", async (req: Request, res: Response) => {
  const { userId } = req.params;
  try {
    const result = await query(`
      SELECT
        c.id, c.type, c.status, c.started_at, c.ended_at, c.duration_seconds, c.created_at,
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

// Log a call
router.post("/", async (req: Request, res: Response) => {
  const { callerId, calleeId, type, status, durationSeconds } = req.body as {
    callerId?: number; calleeId?: number; type?: string;
    status?: string; durationSeconds?: number;
  };
  if (!callerId || !calleeId) { res.status(400).json({ success: false }); return; }
  try {
    const result = await query(`
      INSERT INTO calls (caller_id, callee_id, type, status, duration_seconds, started_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING *
    `, [callerId, calleeId, type ?? "audio", status ?? "missed", durationSeconds ?? 0]);
    res.json({ success: true, call: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

export default router;

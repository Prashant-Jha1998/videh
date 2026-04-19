import { Router, type Request, type Response } from "express";
import { query } from "../lib/db";

const router = Router();

// Get all active statuses for contacts
router.get("/user/:userId", async (req: Request, res: Response) => {
  const { userId } = req.params;
  try {
    const result = await query(`
      SELECT
        s.id, s.user_id, s.content, s.type, s.background_color,
        s.media_url, s.expires_at, s.created_at,
        u.name AS user_name, u.avatar_url AS user_avatar,
        EXISTS(
          SELECT 1 FROM status_views sv
          WHERE sv.status_id = s.id AND sv.viewer_id = $1::int
        ) AS viewed
      FROM statuses s
      JOIN users u ON u.id = s.user_id
      WHERE s.expires_at > NOW()
        AND (
          s.user_id = $1::int
          OR s.user_id IN (
            SELECT contact_user_id FROM contacts WHERE user_id = $1::int AND is_blocked = FALSE
          )
        )
      ORDER BY s.created_at DESC
    `, [userId]);

    res.json({ success: true, statuses: result.rows });
  } catch (err) {
    req.log.error({ err }, "get statuses error");
    res.status(500).json({ success: false });
  }
});

// Post a status
router.post("/", async (req: Request, res: Response) => {
  const { userId, content, type, backgroundColor, mediaUrl } = req.body as {
    userId?: number; content?: string; type?: string; backgroundColor?: string; mediaUrl?: string;
  };
  if (!userId || !content) { res.status(400).json({ success: false }); return; }
  try {
    const result = await query(`
      INSERT INTO statuses (user_id, content, type, background_color, media_url)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [userId, content, type ?? "text", backgroundColor ?? "#00A884", mediaUrl ?? null]);
    res.json({ success: true, status: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// Mark status as viewed
router.post("/:statusId/view", async (req: Request, res: Response) => {
  const { statusId } = req.params;
  const { viewerId } = req.body as { viewerId?: number };
  try {
    await query(
      "INSERT INTO status_views (status_id, viewer_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [statusId, viewerId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// Delete status
router.delete("/:statusId", async (req: Request, res: Response) => {
  const { statusId } = req.params;
  const { userId } = req.body as { userId?: number };
  try {
    await query("DELETE FROM statuses WHERE id = $1 AND user_id = $2", [statusId, userId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

export default router;

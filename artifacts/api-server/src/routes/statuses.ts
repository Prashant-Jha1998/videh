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
        ) AS viewed,
        (SELECT COUNT(*) FROM status_views sv2 WHERE sv2.status_id = s.id) AS view_count,
        (SELECT COUNT(*) FROM status_reactions sr WHERE sr.status_id = s.id) AS reaction_count,
        (SELECT emoji FROM status_reactions WHERE status_id = s.id AND user_id = $1::int LIMIT 1) AS my_reaction
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

// Get viewers list with their reactions (only status owner can see this)
router.get("/:statusId/viewers", async (req: Request, res: Response) => {
  const { statusId } = req.params;
  const { ownerId } = req.query as { ownerId?: string };
  try {
    const result = await query(`
      SELECT
        u.id, u.name, u.avatar_url AS avatar,
        sv.viewed_at,
        sr.emoji AS reaction
      FROM status_views sv
      JOIN users u ON u.id = sv.viewer_id
      LEFT JOIN status_reactions sr ON sr.status_id = sv.status_id AND sr.user_id = sv.viewer_id
      WHERE sv.status_id = $1
        AND ($2::int IS NULL OR (
          SELECT user_id FROM statuses WHERE id = $1
        ) = $2::int)
      ORDER BY sv.viewed_at DESC
    `, [statusId, ownerId ?? null]);

    // Aggregate reaction counts
    const reactionMap: Record<string, number> = {};
    result.rows.forEach((r: any) => {
      if (r.reaction) reactionMap[r.reaction] = (reactionMap[r.reaction] ?? 0) + 1;
    });

    res.json({
      success: true,
      viewers: result.rows,
      viewCount: result.rows.length,
      reactions: reactionMap,
    });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// Add or update a reaction
router.post("/:statusId/react", async (req: Request, res: Response) => {
  const { statusId } = req.params;
  const { userId, emoji } = req.body as { userId?: number; emoji?: string };
  if (!userId || !emoji) { res.status(400).json({ success: false }); return; }
  try {
    await query(`
      INSERT INTO status_reactions (status_id, user_id, emoji)
      VALUES ($1, $2, $3)
      ON CONFLICT (status_id, user_id) DO UPDATE SET emoji = $3, reacted_at = NOW()
    `, [statusId, userId, emoji]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// Remove a reaction
router.delete("/:statusId/react", async (req: Request, res: Response) => {
  const { statusId } = req.params;
  const { userId } = req.body as { userId?: number };
  try {
    await query("DELETE FROM status_reactions WHERE status_id = $1 AND user_id = $2", [statusId, userId]);
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

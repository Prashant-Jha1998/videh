import { Router, type Request, type Response } from "express";
import { query } from "../lib/db";

const router = Router();

// Register or login user (called after OTP verification)
router.post("/register", async (req: Request, res: Response) => {
  const { phone } = req.body as { phone?: string };
  if (!phone) { res.status(400).json({ success: false, message: "Phone required" }); return; }

  try {
    const existing = await query("SELECT * FROM users WHERE phone = $1", [phone]);
    if (existing.rows.length > 0) {
      const user = existing.rows[0];
      await query("UPDATE users SET is_online = TRUE, last_seen = NOW() WHERE id = $1", [user.id]);
      res.json({ success: true, user: { ...user, is_online: true } });
    } else {
      const result = await query(
        "INSERT INTO users (phone, is_online) VALUES ($1, TRUE) RETURNING *",
        [phone]
      );
      res.json({ success: true, user: result.rows[0], isNew: true });
    }
  } catch (err) {
    req.log.error({ err }, "register error");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Get user profile
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const result = await query("SELECT id, phone, name, about, avatar_url, is_online, last_seen FROM users WHERE id = $1", [req.params.id]);
    if (result.rows.length === 0) { res.status(404).json({ success: false, message: "User not found" }); return; }
    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Update profile (name, about)
router.put("/:id", async (req: Request, res: Response) => {
  const { name, about } = req.body as { name?: string; about?: string };
  try {
    const result = await query(
      "UPDATE users SET name = COALESCE($1, name), about = COALESCE($2, about), updated_at = NOW() WHERE id = $3 RETURNING *",
      [name ?? null, about ?? null, req.params.id]
    );
    if (result.rows.length === 0) { res.status(404).json({ success: false }); return; }
    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Upload avatar (base64)
router.post("/:id/avatar", async (req: Request, res: Response) => {
  const { base64, mimeType } = req.body as { base64?: string; mimeType?: string };
  if (!base64) { res.status(400).json({ success: false, message: "base64 data required" }); return; }

  try {
    const dataUrl = `data:${mimeType ?? "image/jpeg"};base64,${base64}`;
    const result = await query(
      "UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2 RETURNING id, avatar_url",
      [dataUrl, req.params.id]
    );
    res.json({ success: true, avatarUrl: result.rows[0]?.avatar_url });
  } catch (err) {
    req.log.error({ err }, "avatar upload error");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Set offline
router.post("/:id/offline", async (req: Request, res: Response) => {
  try {
    await query("UPDATE users SET is_online = FALSE, last_seen = NOW() WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// Search users by phone
router.get("/search/:phone", async (req: Request, res: Response) => {
  try {
    const result = await query(
      "SELECT id, phone, name, about, avatar_url, is_online FROM users WHERE phone LIKE $1 LIMIT 20",
      [`%${req.params.phone}%`]
    );
    res.json({ success: true, users: result.rows });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

export default router;

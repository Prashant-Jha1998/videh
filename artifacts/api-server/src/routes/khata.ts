import { Router, type Request, type Response } from "express";
import { query } from "../lib/db";

const router = Router();

// Get all khata entries for a chat
router.get("/chat/:chatId", async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT ke.*, u.name as creator_name, u.avatar_url as creator_avatar
       FROM khata_entries ke
       JOIN users u ON u.id = ke.created_by
       WHERE ke.chat_id = $1
       ORDER BY ke.created_at DESC`,
      [req.params.chatId]
    );
    res.json({ success: true, entries: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Add a khata entry
router.post("/", async (req: Request, res: Response) => {
  const { chatId, createdBy, debtorName, amount, note } = req.body as any;
  if (!chatId || !createdBy || !debtorName || !amount) {
    res.status(400).json({ success: false, message: "chatId, createdBy, debtorName, amount required" });
    return;
  }
  try {
    const result = await query(
      `INSERT INTO khata_entries (chat_id, created_by, debtor_name, amount, note)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [chatId, createdBy, debtorName, parseFloat(amount), note ?? null]
    );

    // Also send a message in the chat to notify members
    const entry = result.rows[0];
    const msgContent = `💰 Khata entry added: *${debtorName}* ne ₹${Number(amount).toFixed(2)} lene hain${note ? ` — ${note}` : ""}`;
    await query(
      `INSERT INTO messages (chat_id, sender_id, content, type) VALUES ($1,$2,$3,'text')`,
      [chatId, createdBy, msgContent]
    );

    res.json({ success: true, entry });
  } catch (err) {
    req.log.error({ err }, "add khata error");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Mark entry as paid
router.put("/:id/pay", async (req: Request, res: Response) => {
  try {
    const result = await query(
      `UPDATE khata_entries SET paid = TRUE, paid_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: "Entry not found" });
      return;
    }
    const entry = result.rows[0];
    // Send payment notification in chat
    await query(
      `INSERT INTO messages (chat_id, sender_id, content, type) VALUES ($1,$2,$3,'text')`,
      [entry.chat_id, entry.created_by, `✅ Khata cleared: *${entry.debtor_name}* ka ₹${Number(entry.amount).toFixed(2)} paid ho gaya!`]
    );
    res.json({ success: true, entry });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Delete a khata entry
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    await query("DELETE FROM khata_entries WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;

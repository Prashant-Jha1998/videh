import { Router, type Request, type Response } from "express";
import { query } from "../lib/db";

const router = Router();

let khataTablesEnsured = false;
async function ensureKhataTables() {
  if (khataTablesEnsured) return;
  await query(`
    CREATE TABLE IF NOT EXISTS khata_entries (
      id SERIAL PRIMARY KEY,
      chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      debtor_name TEXT NOT NULL,
      amount NUMERIC(12, 2) NOT NULL,
      note TEXT,
      paid BOOLEAN NOT NULL DEFAULT FALSE,
      paid_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_khata_entries_chat_created
      ON khata_entries (chat_id, created_at DESC)
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_khata_entries_chat_paid
      ON khata_entries (chat_id, paid)
  `);
  khataTablesEnsured = true;
}

// Get all khata entries for a chat
router.get("/chat/:chatId", async (req: Request, res: Response) => {
  try {
    await ensureKhataTables();
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
    await ensureKhataTables();
    const result = await query(
      `INSERT INTO khata_entries (chat_id, created_by, debtor_name, amount, note)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [chatId, createdBy, debtorName, parseFloat(amount), note ?? null]
    );

    // Also send a message in the chat to notify members
    const entry = result.rows[0];
    const msgContent = `Ledger entry added: ${debtorName} owes ₹${Number(amount).toFixed(2)}${note ? ` - ${note}` : ""}`;
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
    await ensureKhataTables();
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
      [entry.chat_id, entry.created_by, `Ledger entry cleared: ${entry.debtor_name}'s ₹${Number(entry.amount).toFixed(2)} entry is now paid.`]
    );
    res.json({ success: true, entry });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Delete a khata entry
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    await ensureKhataTables();
    await query("DELETE FROM khata_entries WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;

import { Router, type Request, type Response } from "express";
import { query } from "../lib/db";

const router = Router();

// Get SOS contacts for a user
router.get("/:userId/contacts", async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT sc.*, u.name as linked_name, u.phone as linked_phone
       FROM sos_contacts sc
       LEFT JOIN users u ON u.id = sc.contact_user_id
       WHERE sc.user_id = $1
       ORDER BY sc.created_at ASC`,
      [req.params.userId]
    );
    res.json({ success: true, contacts: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Add SOS contact
router.post("/:userId/contacts", async (req: Request, res: Response) => {
  const { contactName, contactPhone, contactUserId } = req.body as any;
  if (!contactName) {
    res.status(400).json({ success: false, message: "contactName required" });
    return;
  }
  try {
    // If phone given, try to find user in DB
    let userId: number | null = contactUserId ?? null;
    if (!userId && contactPhone) {
      const found = await query("SELECT id FROM users WHERE phone = $1", [contactPhone]);
      if (found.rows.length > 0) userId = found.rows[0].id;
    }
    const result = await query(
      `INSERT INTO sos_contacts (user_id, contact_name, contact_phone, contact_user_id)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.params.userId, contactName, contactPhone ?? null, userId]
    );
    res.json({ success: true, contact: result.rows[0] });
  } catch (err) {
    req.log.error({ err }, "add sos contact error");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Delete SOS contact
router.delete("/:userId/contacts/:contactId", async (req: Request, res: Response) => {
  try {
    await query("DELETE FROM sos_contacts WHERE id = $1 AND user_id = $2", [req.params.contactId, req.params.userId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Trigger SOS — sends emergency message to all SOS contacts who use the app
router.post("/:userId/trigger", async (req: Request, res: Response) => {
  const { latitude, longitude, address } = req.body as any;
  try {
    const user = await query("SELECT * FROM users WHERE id = $1", [req.params.userId]);
    if (user.rows.length === 0) { res.status(404).json({ success: false }); return; }
    const sender = user.rows[0];

    // Get all SOS contacts who have Videh accounts
    const contacts = await query(
      `SELECT sc.*, u.id as linked_id, u.push_token FROM sos_contacts sc
       LEFT JOIN users u ON u.id = sc.contact_user_id
       WHERE sc.user_id = $1`,
      [req.params.userId]
    );

    const locationText = latitude ? `📍 Location: https://maps.google.com/?q=${latitude},${longitude}` : (address ? `📍 ${address}` : "");
    const sosMsg = `🚨 SOS ALERT! ${sender.name ?? sender.phone} ko madad chahiye!\n${locationText}`;

    let sentCount = 0;
    for (const contact of contacts.rows) {
      if (!contact.linked_id) continue;
      // Find or create a chat between sender and this contact
      const existingChat = await query(
        `SELECT c.id FROM chats c
         JOIN chat_members cm1 ON cm1.chat_id = c.id AND cm1.user_id = $1
         JOIN chat_members cm2 ON cm2.chat_id = c.id AND cm2.user_id = $2
         WHERE c.is_group = FALSE LIMIT 1`,
        [req.params.userId, contact.linked_id]
      );

      let chatId: number;
      if (existingChat.rows.length > 0) {
        chatId = existingChat.rows[0].id;
      } else {
        const newChat = await query("INSERT INTO chats (is_group) VALUES (FALSE) RETURNING id", []);
        chatId = newChat.rows[0].id;
        await query("INSERT INTO chat_members (chat_id, user_id) VALUES ($1,$2),($1,$3)", [chatId, req.params.userId, contact.linked_id]);
      }

      await query(
        "INSERT INTO messages (chat_id, sender_id, content, type) VALUES ($1,$2,$3,'text')",
        [chatId, req.params.userId, sosMsg]
      );

      // Push notification if they have a push token
      if (contact.push_token?.startsWith("ExponentPushToken")) {
        fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: contact.push_token,
            title: `🚨 SOS — ${sender.name ?? sender.phone}`,
            body: locationText || "Emergency! Please help!",
            data: { chatId, sos: true },
            priority: "high",
            sound: "default",
          }),
        }).catch(() => {});
      }
      sentCount++;
    }

    res.json({ success: true, sentTo: sentCount });
  } catch (err) {
    req.log.error({ err }, "sos trigger error");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;

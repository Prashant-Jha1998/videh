import { Router, type Request, type Response } from "express";
import { EXPO_ANDROID_CHANNEL_ID, isExpoPushToken, sendExpoPush } from "../lib/expoPush";
import { query } from "../lib/db";
import { stateGetJson, stateSetJson } from "../lib/sharedState";

const router = Router();
const MAX_SOS_CONTACTS = 5;

function normalizePhone(raw: string): string {
  return raw.replace(/[^\d+]/g, "").trim();
}

function singleParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

async function findOrCreateDirectChat(userId: string | number, otherUserId: number): Promise<number> {
  const existingChat = await query(
    `SELECT c.id FROM chats c
     JOIN chat_members cm1 ON cm1.chat_id = c.id AND cm1.user_id = $1
     JOIN chat_members cm2 ON cm2.chat_id = c.id AND cm2.user_id = $2
     WHERE c.is_group = FALSE LIMIT 1`,
    [userId, otherUserId]
  );

  if (existingChat.rows.length > 0) {
    return existingChat.rows[0].id;
  }

  const newChat = await query("INSERT INTO chats (is_group) VALUES (FALSE) RETURNING id", []);
  const chatId = newChat.rows[0].id;
  await query("INSERT INTO chat_members (chat_id, user_id) VALUES ($1,$2),($1,$3)", [chatId, userId, otherUserId]);
  return chatId;
}

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
  const trimmedName = String(contactName ?? "").trim();
  if (!trimmedName) {
    res.status(400).json({ success: false, message: "contactName required" });
    return;
  }
  const normalizedPhone = contactPhone ? normalizePhone(String(contactPhone)) : null;
  if (normalizedPhone && !/^\+?[1-9]\d{9,14}$/.test(normalizedPhone)) {
    res.status(400).json({ success: false, message: "Invalid phone number format" });
    return;
  }
  try {
    const countResult = await query("SELECT COUNT(*)::int AS count FROM sos_contacts WHERE user_id = $1", [req.params.userId]);
    if ((countResult.rows[0]?.count ?? 0) >= MAX_SOS_CONTACTS) {
      res.status(400).json({ success: false, message: `Maximum ${MAX_SOS_CONTACTS} SOS contacts allowed` });
      return;
    }

    const duplicateResult = await query(
      "SELECT id FROM sos_contacts WHERE user_id = $1 AND lower(contact_name) = lower($2) AND coalesce(contact_phone, '') = coalesce($3, '') LIMIT 1",
      [req.params.userId, trimmedName, normalizedPhone]
    );
    if (duplicateResult.rows.length > 0) {
      res.status(409).json({ success: false, message: "Contact already added" });
      return;
    }

    // If phone given, try to find user in DB
    let userId: number | null = contactUserId ?? null;
    if (!userId && normalizedPhone) {
      const found = await query("SELECT id FROM users WHERE phone = $1", [normalizedPhone]);
      if (found.rows.length > 0) userId = found.rows[0].id;
    }
    const result = await query(
      `INSERT INTO sos_contacts (user_id, contact_name, contact_phone, contact_user_id)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.params.userId, trimmedName, normalizedPhone, userId]
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
  const userId = singleParam(req.params.userId);
  try {
    const user = await query("SELECT * FROM users WHERE id = $1", [userId]);
    if (user.rows.length === 0) { res.status(404).json({ success: false }); return; }
    const sender = user.rows[0];

    // Get all SOS contacts who have Videh accounts
    const contacts = await query(
      `SELECT sc.*, u.id as linked_id, u.push_token FROM sos_contacts sc
       LEFT JOIN users u ON u.id = sc.contact_user_id
       WHERE sc.user_id = $1`,
      [req.params.userId]
    );

    if (contacts.rows.length === 0) {
      res.status(400).json({ success: false, message: "No SOS contacts configured" });
      return;
    }
    const locationText = latitude ? `📍 Location: https://maps.google.com/?q=${latitude},${longitude}` : (address ? `📍 ${address}` : "");
    const sosMsg = `🚨 SOS ALERT: ${sender.name ?? sender.phone} needs immediate help.\n${locationText}`;

    let sentCount = 0;
    const smsFallbackNumbers: string[] = [];
    for (const contact of contacts.rows) {
      if (!contact.linked_id) {
        if (contact.contact_phone) smsFallbackNumbers.push(contact.contact_phone);
        continue;
      }
      const chatId = await findOrCreateDirectChat(userId, contact.linked_id);

      await query(
        "INSERT INTO messages (chat_id, sender_id, content, type) VALUES ($1,$2,$3,'text')",
        [chatId, userId, sosMsg]
      );

      // Push notification if they have a push token
      if (isExpoPushToken(contact.push_token)) {
        sendExpoPush({
          to: contact.push_token,
          title: `🚨 SOS — ${sender.name ?? sender.phone}`,
          body: locationText || "Emergency! Please help!",
          data: { chatId, sos: true },
          priority: "high",
          channelId: EXPO_ANDROID_CHANNEL_ID,
          sound: "default",
        });
      }
      sentCount++;
    }

    res.json({ success: true, sentTo: sentCount, smsFallbackNumbers });
  } catch (err) {
    req.log.error({ err }, "sos trigger error");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Periodic live-location update after SOS trigger
router.post("/:userId/location-update", async (req: Request, res: Response) => {
  const { latitude, longitude } = req.body as { latitude?: number; longitude?: number };
  const userId = singleParam(req.params.userId);
  if (typeof latitude !== "number" || typeof longitude !== "number") {
    res.status(400).json({ success: false, message: "latitude and longitude are required" });
    return;
  }

  const throttleKey = `sos:location-throttle:${userId}`;
  const now = Date.now();
  const lastSent = await stateGetJson<number>(throttleKey) ?? 0;
  if (now - lastSent < 45_000) {
    res.json({ success: true, skipped: true });
    return;
  }

  try {
    const user = await query("SELECT * FROM users WHERE id = $1", [userId]);
    if (user.rows.length === 0) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }
    const sender = user.rows[0];
    const contacts = await query(
      `SELECT sc.contact_user_id
       FROM sos_contacts sc
       WHERE sc.user_id = $1 AND sc.contact_user_id IS NOT NULL`,
      [userId]
    );
    const msg = `📡 Live location update from ${sender.name ?? sender.phone}: https://maps.google.com/?q=${latitude},${longitude}`;
    for (const contact of contacts.rows) {
      const chatId = await findOrCreateDirectChat(userId, contact.contact_user_id);
      await query("INSERT INTO messages (chat_id, sender_id, content, type) VALUES ($1,$2,$3,'text')", [chatId, userId, msg]);
    }
    await stateSetJson(throttleKey, now, 45_000);
    res.json({ success: true, sentTo: contacts.rows.length });
  } catch (err) {
    req.log.error({ err }, "sos location update error");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Trusted contact verification ping
router.post("/:userId/contacts/:contactId/verify", async (req: Request, res: Response) => {
  const userId = singleParam(req.params.userId);
  try {
    const contactResult = await query(
      "SELECT sc.*, u.name AS linked_name FROM sos_contacts sc LEFT JOIN users u ON u.id = sc.contact_user_id WHERE sc.id = $1 AND sc.user_id = $2",
      [req.params.contactId, userId]
    );
    if (contactResult.rows.length === 0) {
      res.status(404).json({ success: false, message: "Contact not found" });
      return;
    }
    const contact = contactResult.rows[0];
    if (!contact.contact_user_id) {
      res.status(400).json({ success: false, message: "Contact is not linked to Videh user" });
      return;
    }
    const senderResult = await query("SELECT name, phone FROM users WHERE id = $1", [userId]);
    const sender = senderResult.rows[0];
    const chatId = await findOrCreateDirectChat(userId, contact.contact_user_id);
    const verifyMessage = `✅ Trusted-contact verification request from ${sender?.name ?? sender?.phone ?? "Videh user"}. Please confirm in app chat.`;
    await query("INSERT INTO messages (chat_id, sender_id, content, type) VALUES ($1,$2,$3,'text')", [chatId, userId, verifyMessage]);
    res.json({ success: true, message: "Verification request sent" });
  } catch (err) {
    req.log.error({ err }, "sos contact verify error");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;

import { Router, type Request, type Response } from "express";
import { assertSameUser } from "../lib/auth";
import { isValidPushToken, sendChatPush } from "../lib/pushNotify";
import { query } from "../lib/db";
import { stateGetJson, stateSetJson } from "../lib/sharedState";
import { normalizePhone } from "../lib/phoneNormalize";
import { publishChatEvent } from "../lib/realtime";

const router = Router();
const MAX_SOS_CONTACTS = 5;

function mapsSearchUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
}

function parseCoords(latitude: unknown, longitude: unknown): { lat: number; lng: number } | null {
  const lat = typeof latitude === "number" ? latitude : Number(latitude);
  const lng = typeof longitude === "number" ? longitude : Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

async function insertAndPublishSosMessage(opts: {
  chatId: number;
  senderId: number;
  senderName: string;
  content: string;
  type: "text" | "location";
  mediaUrl?: string | null;
  recipientId: number;
}): Promise<number> {
  const result = await query(
    `INSERT INTO messages (chat_id, sender_id, content, type, media_url)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [opts.chatId, opts.senderId, opts.content, opts.type, opts.mediaUrl ?? null],
  );
  const messageId = Number(result.rows[0].id);
  publishChatEvent({
    type: "message",
    chatId: opts.chatId,
    userIds: [opts.senderId, opts.recipientId],
    payload: {
      messageId,
      content: opts.content,
      type: opts.type,
      mediaUrl: opts.mediaUrl ?? undefined,
      senderId: opts.senderId,
      senderName: opts.senderName,
    },
  });
  return messageId;
}

/** India mobile stored as +91 + exactly 10 digits. */
function toIndiaSosPhone(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const normalized = normalizePhone(raw);
  if (!normalized) return null;
  const digits = normalized.replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12 && /^91[6-9]\d{9}$/.test(digits)) {
    return `+${digits}`;
  }
  return null;
}

function singleParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function requireSosOwner(req: Request, res: Response): string | null {
  const userId = singleParam(req.params.userId);
  if (!assertSameUser(req, res, userId)) return null;
  return userId;
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

/** Link SOS contact to a Videh user by phone; persist link for future triggers. */
async function resolveLinkedUserId(opts: {
  contactId: number;
  contactPhone: string | null;
  contactUserId: number | null;
}): Promise<number | null> {
  if (opts.contactUserId) return Number(opts.contactUserId);
  const phone = toIndiaSosPhone(opts.contactPhone);
  if (!phone) return null;
  const found = await query("SELECT id FROM users WHERE phone = $1", [phone]);
  if (found.rows.length === 0) return null;
  const linkedId = Number(found.rows[0].id);
  await query(
    "UPDATE sos_contacts SET contact_user_id = $1, contact_phone = $2 WHERE id = $3",
    [linkedId, phone, opts.contactId],
  );
  return linkedId;
}

// Get SOS contacts for a user
router.get("/:userId/contacts", async (req: Request, res: Response) => {
  const userId = requireSosOwner(req, res);
  if (!userId) return;
  try {
    const result = await query(
      `SELECT sc.*, u.name as linked_name, u.phone as linked_phone
       FROM sos_contacts sc
       LEFT JOIN users u ON u.id = sc.contact_user_id
       WHERE sc.user_id = $1
       ORDER BY sc.created_at ASC`,
      [userId]
    );
    res.json({ success: true, contacts: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Add SOS contact
router.post("/:userId/contacts", async (req: Request, res: Response) => {
  const ownerUserId = requireSosOwner(req, res);
  if (!ownerUserId) return;
  const { contactName, contactPhone, contactUserId } = req.body as {
    contactName?: string;
    contactPhone?: string;
    contactUserId?: number;
  };
  const trimmedName = String(contactName ?? "").trim();
  if (!trimmedName) {
    res.status(400).json({ success: false, message: "contactName required" });
    return;
  }
  const normalizedPhone = toIndiaSosPhone(contactPhone);
  if (!normalizedPhone) {
    res.status(400).json({
      success: false,
      message: "Phone must be a valid Indian mobile: +91 followed by exactly 10 digits",
    });
    return;
  }
  try {
    const countResult = await query("SELECT COUNT(*)::int AS count FROM sos_contacts WHERE user_id = $1", [ownerUserId]);
    if ((countResult.rows[0]?.count ?? 0) >= MAX_SOS_CONTACTS) {
      res.status(400).json({ success: false, message: `Maximum ${MAX_SOS_CONTACTS} SOS contacts allowed` });
      return;
    }

    const duplicateResult = await query(
      "SELECT id FROM sos_contacts WHERE user_id = $1 AND (lower(contact_name) = lower($2) OR contact_phone = $3) LIMIT 1",
      [ownerUserId, trimmedName, normalizedPhone]
    );
    if (duplicateResult.rows.length > 0) {
      res.status(409).json({ success: false, message: "Contact already added" });
      return;
    }

    let linkedUserId: number | null =
      typeof contactUserId === "number" && Number.isFinite(contactUserId) ? contactUserId : null;
    if (!linkedUserId) {
      const found = await query("SELECT id FROM users WHERE phone = $1", [normalizedPhone]);
      if (found.rows.length > 0) linkedUserId = Number(found.rows[0].id);
    }
    const result = await query(
      `INSERT INTO sos_contacts (user_id, contact_name, contact_phone, contact_user_id)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [ownerUserId, trimmedName, normalizedPhone, linkedUserId]
    );
    res.json({ success: true, contact: result.rows[0], linked: Boolean(linkedUserId) });
  } catch (err) {
    req.log.error({ err }, "add sos contact error");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Delete SOS contact
router.delete("/:userId/contacts/:contactId", async (req: Request, res: Response) => {
  const userId = requireSosOwner(req, res);
  if (!userId) return;
  try {
    await query("DELETE FROM sos_contacts WHERE id = $1 AND user_id = $2", [req.params.contactId, userId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Trigger SOS — sends emergency message to all SOS contacts who use the app
router.post("/:userId/trigger", async (req: Request, res: Response) => {
  const userId = requireSosOwner(req, res);
  if (!userId) return;
  const { latitude, longitude, address } = req.body as any;
  try {
    const user = await query("SELECT * FROM users WHERE id = $1", [userId]);
    if (user.rows.length === 0) { res.status(404).json({ success: false }); return; }
    const sender = user.rows[0];

    const contacts = await query(
      `SELECT sc.*, u.id as linked_id, u.push_token FROM sos_contacts sc
       LEFT JOIN users u ON u.id = sc.contact_user_id
       WHERE sc.user_id = $1`,
      [userId]
    );

    if (contacts.rows.length === 0) {
      res.status(400).json({ success: false, message: "No SOS contacts configured" });
      return;
    }
    const coords = parseCoords(latitude, longitude);
    const addressLabel = typeof address === "string" && address.trim() ? address.trim().slice(0, 160) : undefined;
    const locationText = coords
      ? `📍 Location: ${mapsSearchUrl(coords.lat, coords.lng)}`
      : (addressLabel ? `📍 ${addressLabel}` : "");
    const senderName = String(sender.name ?? sender.phone ?? "Videh user");
    const sosMsg = `🚨 SOS ALERT: ${senderName} needs immediate help.${locationText ? `\n${locationText}` : ""}`;

    let sentCount = 0;
    const smsFallbackNumbers: string[] = [];
    for (const contact of contacts.rows) {
      let linkedId = contact.linked_id ? Number(contact.linked_id) : null;
      if (!linkedId) {
        linkedId = await resolveLinkedUserId({
          contactId: Number(contact.id),
          contactPhone: contact.contact_phone,
          contactUserId: contact.contact_user_id ? Number(contact.contact_user_id) : null,
        });
      }
      if (!linkedId) {
        const phone = toIndiaSosPhone(contact.contact_phone) ?? contact.contact_phone;
        if (phone) smsFallbackNumbers.push(phone);
        continue;
      }

      const chatId = await findOrCreateDirectChat(userId, linkedId);

      // 1) Alert text so chat list shows SOS clearly
      await insertAndPublishSosMessage({
        chatId,
        senderId: Number(userId),
        senderName,
        content: sosMsg,
        type: "text",
        recipientId: linkedId,
      });

      // 2) Native location bubble (map preview) when GPS is available
      if (coords) {
        const locationContent = JSON.stringify({
          v: 1,
          mode: "live",
          lat: coords.lat,
          lng: coords.lng,
          label: addressLabel || "SOS live location",
          until: Date.now() + 30 * 60_000,
          comment: "SOS emergency location",
        });
        await insertAndPublishSosMessage({
          chatId,
          senderId: Number(userId),
          senderName,
          content: locationContent,
          type: "location",
          mediaUrl: mapsSearchUrl(coords.lat, coords.lng),
          recipientId: linkedId,
        });
      }

      const pushRow = await query("SELECT push_token FROM users WHERE id = $1", [linkedId]);
      const pushToken = pushRow.rows[0]?.push_token ?? contact.push_token;
      if (isValidPushToken(pushToken)) {
        await sendChatPush(
          pushToken ?? [],
          `🚨 SOS — ${senderName}`,
          coords ? "📍 Live location shared — open chat" : (locationText || "Emergency! Please help!"),
          { chatId: String(chatId), sos: "true", notificationKind: "sos" },
        );
      }
      sentCount++;
    }

    res.json({
      success: true,
      sentTo: sentCount,
      smsFallbackNumbers,
      locationIncluded: Boolean(coords),
    });
  } catch (err) {
    req.log.error({ err }, "sos trigger error");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Periodic live-location update after SOS trigger
router.post("/:userId/location-update", async (req: Request, res: Response) => {
  const userId = requireSosOwner(req, res);
  if (!userId) return;
  const { latitude, longitude } = req.body as { latitude?: number; longitude?: number };
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
      `SELECT sc.id, sc.contact_phone, sc.contact_user_id
       FROM sos_contacts sc
       WHERE sc.user_id = $1`,
      [userId]
    );
    const coords = parseCoords(latitude, longitude);
    if (!coords) {
      res.status(400).json({ success: false, message: "Invalid coordinates" });
      return;
    }
    const senderName = String(sender.name ?? sender.phone ?? "Videh user");
    const locationContent = JSON.stringify({
      v: 1,
      mode: "live",
      lat: coords.lat,
      lng: coords.lng,
      label: "SOS live location",
      until: Date.now() + 30 * 60_000,
      comment: "SOS location update",
    });
    const mediaUrl = mapsSearchUrl(coords.lat, coords.lng);
    let sentTo = 0;
    for (const contact of contacts.rows) {
      const linkedId = await resolveLinkedUserId({
        contactId: Number(contact.id),
        contactPhone: contact.contact_phone,
        contactUserId: contact.contact_user_id ? Number(contact.contact_user_id) : null,
      });
      if (!linkedId) continue;
      const chatId = await findOrCreateDirectChat(userId, linkedId);
      await insertAndPublishSosMessage({
        chatId,
        senderId: Number(userId),
        senderName,
        content: locationContent,
        type: "location",
        mediaUrl,
        recipientId: linkedId,
      });
      sentTo++;
    }
    await stateSetJson(throttleKey, now, 45_000);
    res.json({ success: true, sentTo });
  } catch (err) {
    req.log.error({ err }, "sos location update error");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Trusted contact verification ping
router.post("/:userId/contacts/:contactId/verify", async (req: Request, res: Response) => {
  const userId = requireSosOwner(req, res);
  if (!userId) return;
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
    let linkedUserId = contact.contact_user_id ? Number(contact.contact_user_id) : null;
    if (!linkedUserId) {
      linkedUserId = await resolveLinkedUserId({
        contactId: Number(contact.id),
        contactPhone: contact.contact_phone,
        contactUserId: null,
      });
    }
    if (!linkedUserId) {
      res.status(400).json({ success: false, message: "Contact is not linked to Videh user" });
      return;
    }
    const senderResult = await query("SELECT name, phone FROM users WHERE id = $1", [userId]);
    const sender = senderResult.rows[0];
    const chatId = await findOrCreateDirectChat(userId, linkedUserId);
    const verifyMessage = `✅ Trusted-contact verification request from ${sender?.name ?? sender?.phone ?? "Videh user"}. Please confirm in app chat.`;
    await query("INSERT INTO messages (chat_id, sender_id, content, type) VALUES ($1,$2,$3,'text')", [chatId, userId, verifyMessage]);
    res.json({ success: true, message: "Verification request sent" });
  } catch (err) {
    req.log.error({ err }, "sos contact verify error");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;

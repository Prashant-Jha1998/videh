import { query } from "./db";
import { filterSseConnectedUserIds, publishChatEvent } from "./realtime";

/** standard aggregate: all recipients read → read; all delivered+ → delivered; else sent. */
export async function senderDeliveryStatusForMessage(
  messageId: number,
  senderId: number,
): Promise<"read" | "delivered" | "sent"> {
  const r = await query(
    `SELECT
       COUNT(*) FILTER (WHERE cm.user_id != $2) AS recipient_count,
       COUNT(*) FILTER (
         WHERE cm.user_id != $2
           AND EXISTS (
             SELECT 1 FROM message_status ms
             WHERE ms.message_id = $1 AND ms.user_id = cm.user_id AND ms.status = 'read'
           )
       ) AS read_count,
       COUNT(*) FILTER (
         WHERE cm.user_id != $2
           AND EXISTS (
             SELECT 1 FROM message_status ms
             WHERE ms.message_id = $1 AND ms.user_id = cm.user_id
               AND ms.status IN ('read', 'delivered')
           )
       ) AS delivered_or_read_count
     FROM messages m
     JOIN chat_members cm ON cm.chat_id = m.chat_id
     WHERE m.id = $1`,
    [messageId, senderId],
  );
  const row = r.rows[0] as {
    recipient_count?: string | number;
    read_count?: string | number;
    delivered_or_read_count?: string | number;
  } | undefined;
  const recipients = Number(row?.recipient_count ?? 0);
  if (recipients <= 0) return "sent";
  const readCount = Number(row?.read_count ?? 0);
  const deliveredCount = Number(row?.delivered_or_read_count ?? 0);
  if (readCount >= recipients) return "read";
  if (deliveredCount >= recipients) return "delivered";
  return "sent";
}

/** SQL fragment for GET messages — same aggregation as senderDeliveryStatusForMessage. */
export const SENDER_DELIVERY_STATUS_SQL = `
  CASE
    WHEN (
      SELECT COUNT(*) FROM chat_members cm_r
      WHERE cm_r.chat_id = m.chat_id AND cm_r.user_id != m.sender_id
    ) = 0 THEN 'sent'
    WHEN (
      SELECT COUNT(*) FROM chat_members cm_r
      WHERE cm_r.chat_id = m.chat_id AND cm_r.user_id != m.sender_id
        AND NOT EXISTS (
          SELECT 1 FROM message_status ms_r
          WHERE ms_r.message_id = m.id AND ms_r.user_id = cm_r.user_id AND ms_r.status = 'read'
        )
    ) = 0 THEN 'read'
    WHEN (
      SELECT COUNT(*) FROM chat_members cm_r
      WHERE cm_r.chat_id = m.chat_id AND cm_r.user_id != m.sender_id
        AND NOT EXISTS (
          SELECT 1 FROM message_status ms_r
          WHERE ms_r.message_id = m.id AND ms_r.user_id = cm_r.user_id
            AND ms_r.status IN ('read', 'delivered')
        )
    ) = 0 THEN 'delivered'
    ELSE 'sent'
  END`;

export function publishReceiptEvent(args: {
  chatId: string | number;
  senderIds: number[];
  status: "delivered" | "read";
  messageIds: number[];
  recipientUserId?: number;
}): void {
  const { chatId, senderIds, status, messageIds, recipientUserId } = args;
  const uniqueSenders = [...new Set(senderIds.filter((id) => Number.isFinite(id) && id > 0))];
  for (const senderId of uniqueSenders) {
    publishChatEvent({
      type: "read",
      chatId,
      userIds: [senderId],
      payload: {
        action: "receipt",
        status,
        messageIds,
        recipientUserId,
      },
    });
  }
}

/** Recipient device ACK — marks delivered and notifies sender(s). */
export async function markMessagesDeliveredForRecipient(args: {
  chatId: string | number;
  recipientUserId: number;
  messageIds: number[];
}): Promise<{ updated: number[] }> {
  const { chatId, recipientUserId, messageIds } = args;
  const ids = [...new Set(messageIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (ids.length === 0) return { updated: [] };

  const inserted = await query(
    `INSERT INTO message_status (message_id, user_id, status, updated_at)
     SELECT m.id, $2, 'delivered', NOW()
     FROM messages m
     JOIN chat_members cm ON cm.chat_id = m.chat_id AND cm.user_id = $2
     WHERE m.chat_id = $1
       AND m.id = ANY($3::int[])
       AND m.sender_id != $2
       AND COALESCE(m.is_deleted, FALSE) = FALSE
       AND NOT EXISTS (
         SELECT 1 FROM message_status ms
         WHERE ms.message_id = m.id AND ms.user_id = $2
           AND ms.status IN ('delivered', 'read')
       )
     RETURNING message_id`,
    [chatId, recipientUserId, ids],
  );
  const updatedIds = inserted.rows.map((r: { message_id: number }) => Number(r.message_id));
  if (updatedIds.length === 0) return { updated: [] };

  const senders = await query(
    `SELECT id, sender_id FROM messages WHERE id = ANY($1::int[])`,
    [updatedIds],
  );
  const senderIds = senders.rows.map((r: { sender_id: number }) => Number(r.sender_id));
  publishReceiptEvent({
    chatId,
    senderIds,
    status: "delivered",
    messageIds: updatedIds,
    recipientUserId,
  });

  return { updated: updatedIds };
}

/**
 * Instant double-tick when the recipient can receive now (SSE open or DB online).
 * Message body is always saved and pushed via SSE/push — never gated on is_online.
 */
export async function deliverToOnlineRecipientsOnSend(args: {
  chatId: string | number;
  messageId: number;
  senderId: number;
  recipientUserIds: number[];
}): Promise<void> {
  const recipients = [...new Set(
    args.recipientUserIds.filter((id) => Number.isFinite(id) && id > 0 && id !== args.senderId),
  )];
  if (recipients.length === 0) return;

  const reachable = new Set<number>(filterSseConnectedUserIds(recipients));
  const online = await query(
    `SELECT id FROM users WHERE id = ANY($1::int[]) AND is_online = TRUE`,
    [recipients],
  );
  for (const row of online.rows as Array<{ id: number }>) {
    reachable.add(Number(row.id));
  }
  for (const recipientUserId of reachable) {
    await markMessagesDeliveredForRecipient({
      chatId: args.chatId,
      recipientUserId,
      messageIds: [args.messageId],
    });
  }
}

/** After mark-read, notify message senders in real time. */
export async function publishReadReceiptsForChat(args: {
  chatId: string | number;
  readerUserId: number;
}): Promise<void> {
  const { chatId, readerUserId } = args;
  const r = await query(
    `SELECT m.id, m.sender_id
     FROM messages m
     JOIN chat_members cm ON cm.chat_id = m.chat_id AND cm.user_id = $2
     WHERE m.chat_id = $1
       AND m.sender_id != $2
       AND COALESCE(m.is_deleted, FALSE) = FALSE`,
    [chatId, readerUserId],
  );
  if (!r.rows.length) return;

  const bySender = new Map<number, number[]>();
  for (const row of r.rows as Array<{ id: number; sender_id: number }>) {
    const sid = Number(row.sender_id);
    const list = bySender.get(sid) ?? [];
    list.push(Number(row.id));
    bySender.set(sid, list);
  }

  for (const [senderId, messageIds] of bySender) {
    publishReceiptEvent({
      chatId,
      senderIds: [senderId],
      status: "read",
      messageIds,
      recipientUserId: readerUserId,
    });
  }
}

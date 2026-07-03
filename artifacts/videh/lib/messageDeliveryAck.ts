import { getApiUrl } from "@/lib/api";

const ackedKeys = new Set<string>();
const inFlight = new Map<string, Promise<void>>();

function ackKey(chatId: string, messageId: string): string {
  return `${chatId}:${messageId}`;
}

function isServerMessageId(id: string): boolean {
  return /^\d+$/.test(id);
}

/** Tell server this recipient's device received the message (standard delivery receipt). */
export async function ackMessagesDelivered(
  chatId: string,
  messageIds: string[],
  userId: number,
  sessionToken?: string | null,
): Promise<void> {
  const numericIds = [
    ...new Set(
      messageIds
        .filter(isServerMessageId)
        .filter((id) => {
          const key = ackKey(chatId, id);
          if (ackedKeys.has(key)) return false;
          return true;
        }),
    ),
  ];
  if (numericIds.length === 0) return;

  const batchKey = `${chatId}:${numericIds.join(",")}`;
  const pending = inFlight.get(batchKey);
  if (pending) {
    await pending;
    return;
  }

  const run = (async () => {
    try {
      const res = await fetch(`${getApiUrl()}/api/chats/${chatId}/messages/delivered`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
        },
        body: JSON.stringify({
          userId,
          messageIds: numericIds.map(Number),
        }),
      });
      const data = await res.json() as { success?: boolean; updated?: number[] };
      if (data.success) {
        for (const id of numericIds) {
          ackedKeys.add(ackKey(chatId, id));
        }
        for (const id of (data.updated ?? []).map(String)) {
          ackedKeys.add(ackKey(chatId, id));
        }
      } else if (res.status === 404) {
        /* legacy server without /delivered — GET messages will mark delivered */
        for (const id of numericIds) {
          ackedKeys.add(ackKey(chatId, id));
        }
      }
    } catch {
      /* retry on next loadMessages / hint */
    }
  })();

  inFlight.set(batchKey, run);
  try {
    await run;
  } finally {
    inFlight.delete(batchKey);
  }
}

/** Incoming messages from others that should be delivery-ACKed. */
export function incomingMessagesToAck(messages: Array<{ id: string; senderId: string }>): string[] {
  return messages
    .filter((m) => m.senderId !== "me" && isServerMessageId(m.id))
    .map((m) => m.id);
}

export type ReceiptStatus = "delivered" | "read";

/** Apply a realtime receipt SSE to outgoing message ticks. */
export function applyReceiptToOutgoingMessages<T extends { id: string; serverMessageId?: string; senderId: string; status: string }>(
  messages: T[],
  status: ReceiptStatus,
  messageIds: string[],
): T[] {
  const idSet = messageIds.length > 0 ? new Set(messageIds) : null;
  return messages.map((m) => {
    if (m.senderId !== "me") return m;
    const sid = m.serverMessageId ?? m.id;
    if (idSet && !idSet.has(sid) && !idSet.has(m.id)) return m;
    if (status === "read") {
      return { ...m, status: "read" as const };
    }
    if (m.status === "read") return m;
    return { ...m, status: "delivered" as const };
  });
}

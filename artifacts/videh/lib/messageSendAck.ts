import type { Message } from "@/context/AppContext";

/** Map server delivery_status from POST/GET to outgoing message ticks. */
export function outboundStatusFromServer(
  deliveryStatus: string | null | undefined,
): "sent" | "delivered" | "read" {
  if (deliveryStatus === "read") return "read";
  if (deliveryStatus === "delivered") return "delivered";
  return "sent";
}

/** Update delivery fields after server ACK — never replace the local message id. */
export function ackOutgoingMessage(
  msg: Message,
  serverMessageId: string,
  patch: Partial<Message> = {},
): Message {
  const clientMessageId = msg.clientMessageId ?? msg.id;
  return {
    ...msg,
    ...patch,
    id: clientMessageId,
    clientMessageId,
    serverMessageId: String(serverMessageId),
    uploadFailed: false,
    status: patch.status ?? "sent",
  };
}

export function messageMatchesClientId(a: Message, b: Message): boolean {
  const aClient = a.clientMessageId ?? (isLocalOutgoingId(a.id) ? a.id : undefined);
  const bClient = b.clientMessageId ?? (isLocalOutgoingId(b.id) ? b.id : undefined);
  if (aClient && bClient && aClient === bClient) return true;
  if (a.serverMessageId && b.serverMessageId && a.serverMessageId === b.serverMessageId) return true;
  if (a.serverMessageId && b.id === a.serverMessageId) return true;
  if (b.serverMessageId && a.id === b.serverMessageId) return true;
  return false;
}

function isLocalOutgoingId(id: string): boolean {
  return id.startsWith("tmp_") || /^[0-9a-f]{8}-/i.test(id);
}

function isNumericServerId(id: string): boolean {
  return /^\d+$/.test(id);
}

/** Numeric server row id for receipts / message-info API (outgoing rows use client UUID as id). */
export function resolveServerMessageIdForApi(
  id: string,
  opts?: { serverMessageId?: string },
): string | null {
  const fromField = opts?.serverMessageId?.trim();
  if (fromField && isNumericServerId(fromField)) return fromField;

  const raw = String(id ?? "").trim();
  if (!raw || raw.startsWith("tmp_")) return null;
  if (isNumericServerId(raw)) return raw;

  if (raw.startsWith("hint_") && !raw.startsWith("hint_t")) {
    const hinted = raw.slice(5);
    if (isNumericServerId(hinted)) return hinted;
  }

  return null;
}

/** Highest confirmed server row id in local chat history (for incremental sync). */
export function latestServerMessageId(messages: Array<{ id: string; serverMessageId?: string }>): number {
  let max = 0;
  for (const m of messages) {
    if (isNumericServerId(m.id)) {
      max = Math.max(max, Number(m.id));
      continue;
    }
    if (m.serverMessageId && isNumericServerId(m.serverMessageId)) {
      max = Math.max(max, Number(m.serverMessageId));
    }
  }
  return max;
}

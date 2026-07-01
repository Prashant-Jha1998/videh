import type { Message } from "@/context/AppContext";

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

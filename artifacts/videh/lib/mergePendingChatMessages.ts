import type { Message } from "@/context/AppContext";
import { albumSendLog } from "@/lib/albumSendLog";
import { parseAlbumMessageContent, parseAlbumPhotoCountLabel } from "@/lib/chatAlbumMessage";
import { isClientMessageUuid, isLocalOutgoingMessageId } from "@/lib/clientMessageId";
import { messageMatchesClientId } from "@/lib/messageSendAck";

const TEMP_MATCH_WINDOW_MS = 60_000;
const TEMP_TEXT_MATCH_WINDOW_MS = 15_000;
/** Keep optimistic/patched outgoing rows until the messages API returns them. */
const RECENT_OUTGOING_KEEP_MS = 300_000;

function isMediaMessage(m: Message): boolean {
  return m.type === "document" || m.type === "image" || m.type === "video" || m.type === "album";
}

function isUploadInFlight(m: Message): boolean {
  if (m.uploadFailed || !isMediaMessage(m)) return false;
  if (typeof m.uploadProgress === "number" && m.uploadProgress < 100) return true;
  return false;
}

function normalizeUrlKey(url: string | undefined | null): string {
  return String(url ?? "").trim().split("?")[0].split("#")[0];
}

function albumUrlsLikelyMatch(tmp: Message, server: Message): boolean {
  const tmpUrls = (tmp.albumUrls ?? []).map(normalizeUrlKey).filter(Boolean);
  const serverParsed = parseAlbumMessageContent(server.text);
  const serverUrls = (server.albumUrls ?? serverParsed?.urls ?? []).map(normalizeUrlKey).filter(Boolean);
  if (tmpUrls.length < 2 || serverUrls.length < 2) return false;
  if (tmpUrls.length === serverUrls.length && tmpUrls.every((u, i) => u === serverUrls[i])) return true;
  return normalizeUrlKey(tmpUrls[0]) === normalizeUrlKey(serverUrls[0])
    && Math.abs(server.timestamp - tmp.timestamp) < 15_000;
}

function isLocalOutgoingRow(m: Message): boolean {
  return m.senderId === "me" && (isLocalOutgoingMessageId(m.id) || Boolean(m.clientMessageId));
}

function pendingRowOnServer(local: Message, serverMessages: Message[]): boolean {
  return serverMessages.some((s) => messageMatchesClientId(local, s));
}

function tempMatchesServer(tmp: Message, server: Message): boolean {
  if (messageMatchesClientId(tmp, server)) return true;
  if (server.senderId !== "me") return false;
  const matchWindow = tmp.type === "text" || !tmp.type ? TEMP_TEXT_MATCH_WINDOW_MS : TEMP_MATCH_WINDOW_MS;
  if (Math.abs(server.timestamp - tmp.timestamp) > matchWindow) return false;
  if ((tmp.replyToId ?? "") !== (server.replyToId ?? "")) return false;

  if (tmp.type === "text" || !tmp.type) {
    return (server.type === "text" || !server.type) && server.text === tmp.text;
  }
  if (tmp.type === "album") {
    const serverIsAlbum = server.type === "album" || !!parseAlbumMessageContent(server.text);
    if (!serverIsAlbum) return false;
    if (albumUrlsLikelyMatch(tmp, server)) return true;
    if (server.text === tmp.text) return true;
    return false;
  }
  if (server.type !== tmp.type) return false;
  if (server.text === tmp.text) return true;
  const tmpMedia = normalizeUrlKey(tmp.mediaUrl);
  const serverMedia = normalizeUrlKey(server.mediaUrl);
  if (tmpMedia && serverMedia && tmpMedia === serverMedia) return true;
  return Math.abs(server.timestamp - tmp.timestamp) < 15_000;
}

/** Pair each optimistic row with at most one server row. */
export function collectSupersededTempIds(tempMessages: Message[], serverMessages: Message[]): Set<string> {
  const superseded = new Set<string>();
  const usedServerIds = new Set<string>();
  const myServer = serverMessages.filter((m) => m.senderId === "me");
  const sortedTemps = [...tempMessages].sort((a, b) => a.timestamp - b.timestamp);

  for (const tmp of sortedTemps) {
    if (isUploadInFlight(tmp)) continue;
    if (tmp.uploadFailed) continue;
    if (!tmp.serverMessageId && tmp.status === "pending") continue;
    for (const s of myServer) {
      if (usedServerIds.has(s.id)) continue;
      if (tempMatchesServer(tmp, s)) {
        usedServerIds.add(s.id);
        superseded.add(tmp.id);
        if (tmp.type === "album") {
          albumSendLog("merge", "superseded optimistic album with server row", {
            tempId: tmp.id,
            serverId: s.id,
            tempUrlCount: tmp.albumUrls?.length ?? 0,
            serverUrlCount: s.albumUrls?.length ?? 0,
          });
        }
        break;
      }
    }
  }
  return superseded;
}

function isPlaceholderHintText(text: string): boolean {
  const t = text.trim();
  return t === "New message" || t === "Message";
}

export function collectPendingLocalMessages(
  prevMessages: Message[],
  serverMessages: Message[],
  now = Date.now(),
): Message[] {
  const serverIds = new Set(serverMessages.map((m) => m.id));
  const serverClientIds = new Set(
    serverMessages.map((m) => m.clientMessageId).filter(Boolean) as string[],
  );
  const localOutgoing = prevMessages.filter((m) => isLocalOutgoingRow(m));
  const supersededTmpIds = collectSupersededTempIds(localOutgoing, serverMessages);

  return prevMessages.filter((m) => {
    if (m.id.startsWith("hint_")) {
      const hintedServerId = m.id.startsWith("hint_t") ? null : m.id.slice(5);
      if (hintedServerId && serverMessages.some((s) => s.id === hintedServerId)) return false;

      const incomingAfterHint = serverMessages.filter(
        (s) => s.senderId !== "me" && s.timestamp >= m.timestamp - 120_000,
      );
      if (incomingAfterHint.length > 0) {
        const hintText = m.text.trim().toLowerCase();
        const matched = incomingAfterHint.some((s) => {
          if (hintedServerId != null && s.id === hintedServerId) return true;
          const serverText = s.text.trim();
          if (!hintText || !serverText) return false;
          if (serverText === m.text) return true;
          if (serverText.toLowerCase().includes(hintText) || hintText.includes(serverText.toLowerCase())) {
            return true;
          }
          return false;
        });
        if (matched || incomingAfterHint.some((s) => s.timestamp >= m.timestamp - 15_000)) {
          return false;
        }
      }

      if (isPlaceholderHintText(m.text)) {
        if (
          serverMessages.some(
            (s) =>
              s.senderId !== "me"
              && s.timestamp >= m.timestamp - 5000
              && !isPlaceholderHintText(s.text),
          )
        ) {
          return false;
        }
      }
      if (
        serverMessages.some((s) => {
          if (s.senderId === "me") return false;
          if (hintedServerId != null && s.id === hintedServerId) return true;
          if (m.text.trim() && s.text === m.text) return true;
          if (s.type === "album" || parseAlbumMessageContent(s.text)) {
            if (m.type === "album" || parseAlbumMessageContent(m.text)) return true;
            if (parseAlbumPhotoCountLabel(m.text)) return true;
          }
          if (parseAlbumPhotoCountLabel(m.text)) {
            const serverIsAlbum = s.type === "album" || !!parseAlbumMessageContent(s.text);
            if (serverIsAlbum && m.senderId !== "me" && Math.abs(s.timestamp - m.timestamp) < 120_000) {
              return true;
            }
          }
          return false;
        })
      ) {
        return false;
      }
      if (!m.text.trim() && hintedServerId && serverMessages.some((s) => s.id === hintedServerId)) {
        return false;
      }
      return true;
    }
    if (isLocalOutgoingRow(m)) {
      if (isUploadInFlight(m)) return true;
      if (m.uploadFailed) return true;
      if (m.status === "pending" || !m.serverMessageId) {
        if (pendingRowOnServer(m, serverMessages)) return false;
        return true;
      }
      if (supersededTmpIds.has(m.id)) {
        if (m.type === "album") {
          albumSendLog("cleanup", "dropping superseded optimistic album", { tempId: m.id });
        }
        return false;
      }
      const clientId = m.clientMessageId ?? m.id;
      if (serverClientIds.has(clientId)) return false;
      return true;
    }
    if (m.senderId === "me" && !serverIds.has(m.id) && !m.serverMessageId && now - m.timestamp < RECENT_OUTGOING_KEEP_MS) {
      return true;
    }
    return false;
  });
}

function messageIdRank(id: string): number {
  if (id.startsWith("hint_")) return 0;
  if (isLocalOutgoingMessageId(id)) return 1;
  return 2;
}

function isLikelyDuplicateMessage(a: Message, b: Message): boolean {
  if (messageMatchesClientId(a, b)) return true;
  if (a.id === b.id) return true;
  if (a.id === `hint_${b.id}` || b.id === `hint_${a.id}`) return true;
  if (isNumericServerId(a.id) && isNumericServerId(b.id)) return false;
  if (a.senderId !== b.senderId) return false;
  if (a.type !== b.type && a.type !== "text" && b.type !== "text") return false;
  const aText = a.text.trim();
  const bText = b.text.trim();
  if (!aText || !bText || aText !== bText) return false;
  return Math.abs(a.timestamp - b.timestamp) < 15_000;
}

function isNumericServerId(id: string): boolean {
  return /^\d+$/.test(id);
}

function preferCanonicalDuplicate(existing: Message, incoming: Message): Message {
  const existingRank = messageIdRank(existing.id);
  const incomingRank = messageIdRank(incoming.id);
  if (incomingRank > existingRank) return incoming;
  if (incomingRank < existingRank) return existing;
  return incoming.timestamp >= existing.timestamp ? incoming : existing;
}

/** Collapse hint/server twins and accidental double-delivery rows. */
export function dedupeChatMessages(messages: Message[]): Message[] {
  const out: Message[] = [];
  for (const m of messages) {
    const dupIdx = out.findIndex((existing) => isLikelyDuplicateMessage(existing, m));
    if (dupIdx >= 0) {
      out[dupIdx] = preferCanonicalDuplicate(out[dupIdx]!, m);
    } else {
      out.push(m);
    }
  }
  return out.sort((a, b) => a.timestamp - b.timestamp);
}

export function mergeServerWithPending(serverMessages: Message[], pendingLocal: Message[]): Message[] {
  const merged = [...serverMessages];
  for (const p of pendingLocal) {
    const idx = merged.findIndex((m) => messageMatchesClientId(m, p));
    if (idx >= 0) {
      merged[idx] = { ...merged[idx]!, ...p, id: p.clientMessageId ?? p.id, timestamp: p.timestamp };
    } else if (!merged.some((m) => m.id === p.id)) {
      merged.push(p);
    }
  }
  return dedupeChatMessages(merged);
}

/** Keep paginated older rows when refresh only fetches the latest server window. */
export function preserveHistoricallyLoadedMessages(
  prevMessages: Message[],
  serverMessages: Message[],
  clearCutoffMs = 0,
): Message[] {
  if (!serverMessages.length) return serverMessages;
  const serverIds = new Set(serverMessages.map((m) => m.id));
  const oldestServerTs = serverMessages[0]!.timestamp;
  const olderKept = prevMessages.filter((m) => {
    if (clearCutoffMs > 0 && m.timestamp <= clearCutoffMs) return false;
    if (m.id.startsWith("hint_")) return false;
    if (isLocalOutgoingRow(m) && (m.status === "pending" || !m.serverMessageId)) return false;
    if (m.id.startsWith("tmp_")) return false;
    if (serverIds.has(m.id)) return false;
    return m.timestamp < oldestServerTs;
  });
  if (!olderKept.length) return serverMessages;
  return [...olderKept, ...serverMessages].sort((a, b) => a.timestamp - b.timestamp);
}

/** Compare the tail of local history with the latest server page (same length as `serverMessages`). */
export function serverWindowMatchesLocalTail(
  prevMessages: Message[],
  serverMessages: Message[],
  isSameMessage: (a: Message, b: Message) => boolean,
): boolean {
  if (!serverMessages.length) return prevMessages.length === 0;
  const stable = prevMessages.filter(
    (m) => !m.id.startsWith("hint_") && !(isLocalOutgoingRow(m) && m.status === "pending"),
  );
  const newestServer = serverMessages[serverMessages.length - 1]!;
  if (!stable.some((m) => m.id === newestServer.id || messageMatchesClientId(m, newestServer))) return false;
  if (stable.length < serverMessages.length) return false;
  const tail = stable.slice(-serverMessages.length);
  return tail.every((m, i) => isSameMessage(m, serverMessages[i]!));
}

import type { Message } from "@/context/AppContext";
import { albumSendLog } from "@/lib/albumSendLog";
import { parseAlbumMessageContent, parseAlbumPhotoCountLabel } from "@/lib/chatAlbumMessage";

const TEMP_MATCH_WINDOW_MS = 60_000;
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

function tempMatchesServer(tmp: Message, server: Message): boolean {
  if (server.senderId !== "me") return false;
  if (Math.abs(server.timestamp - tmp.timestamp) > TEMP_MATCH_WINDOW_MS) return false;
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

/** Pair each tmp_* row with at most one server row (avoids duplicate-text flicker). */
export function collectSupersededTempIds(tempMessages: Message[], serverMessages: Message[]): Set<string> {
  const superseded = new Set<string>();
  const usedServerIds = new Set<string>();
  const myServer = serverMessages.filter((m) => m.senderId === "me");
  const sortedTemps = [...tempMessages].sort((a, b) => a.timestamp - b.timestamp);

  for (const tmp of sortedTemps) {
    if (isUploadInFlight(tmp)) continue;
    if (tmp.uploadFailed) continue;
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

export function collectPendingLocalMessages(
  prevMessages: Message[],
  serverMessages: Message[],
  now = Date.now(),
): Message[] {
  const serverIds = new Set(serverMessages.map((m) => m.id));
  const supersededTmpIds = collectSupersededTempIds(
    prevMessages.filter((m) => m.id.startsWith("tmp_")),
    serverMessages,
  );

  return prevMessages.filter((m) => {
    if (m.id.startsWith("hint_")) {
      const hintedServerId = m.id.startsWith("hint_t") ? null : m.id.slice(5);
      if (hintedServerId && serverMessages.some((s) => s.id === hintedServerId)) return false;
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
    if (m.id.startsWith("tmp_")) {
      if (isUploadInFlight(m)) return true;
      if (m.uploadFailed) return true;
      if (supersededTmpIds.has(m.id)) {
        if (m.type === "album") {
          albumSendLog("cleanup", "dropping superseded optimistic album", { tempId: m.id });
        }
        return false;
      }
      return true;
    }
    if (m.senderId === "me" && !serverIds.has(m.id) && now - m.timestamp < RECENT_OUTGOING_KEEP_MS) {
      return true;
    }
    return false;
  });
}

export function mergeServerWithPending(serverMessages: Message[], pendingLocal: Message[]): Message[] {
  const merged = [...serverMessages];
  for (const p of pendingLocal) {
    if (!merged.some((m) => m.id === p.id)) merged.push(p);
  }
  merged.sort((a, b) => a.timestamp - b.timestamp);
  return merged;
}

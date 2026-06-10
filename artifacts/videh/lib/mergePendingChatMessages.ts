import type { Message } from "@/context/AppContext";

const TEMP_MATCH_WINDOW_MS = 60_000;
/** Keep optimistic/patched outgoing rows until the messages API returns them. */
const RECENT_OUTGOING_KEEP_MS = 120_000;

function isUploadInFlight(m: Message): boolean {
  return (
    (m.type === "document" || m.type === "image" || m.type === "video" || m.type === "album")
    && typeof m.uploadProgress === "number"
    && m.uploadProgress < 100
    && !m.uploadFailed
  );
}

function tempMatchesServer(tmp: Message, server: Message): boolean {
  if (server.senderId !== "me") return false;
  if (Math.abs(server.timestamp - tmp.timestamp) > TEMP_MATCH_WINDOW_MS) return false;
  if ((tmp.replyToId ?? "") !== (server.replyToId ?? "")) return false;

  if (tmp.type === "text" || !tmp.type) {
    return (server.type === "text" || !server.type) && server.text === tmp.text;
  }
  if (server.type !== tmp.type) return false;
  if (tmp.type === "album") {
    const tmpCount = tmp.albumUrls?.length ?? 0;
    const serverCount = server.albumUrls?.length ?? 0;
    if (tmpCount >= 2 && serverCount >= 2 && tmpCount === serverCount) return true;
    if (server.text === tmp.text) return true;
    return Math.abs(server.timestamp - tmp.timestamp) < 15_000;
  }
  if (server.text === tmp.text) return true;
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
    for (const s of myServer) {
      if (usedServerIds.has(s.id)) continue;
      if (tempMatchesServer(tmp, s)) {
        usedServerIds.add(s.id);
        superseded.add(tmp.id);
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
        m.text.trim()
        && serverMessages.some(
          (s) =>
            s.senderId !== "me"
            && (s.text === m.text || (hintedServerId != null && s.id === hintedServerId)),
        )
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
      return !supersededTmpIds.has(m.id);
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

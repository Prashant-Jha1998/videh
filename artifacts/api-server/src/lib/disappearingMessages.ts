import { query } from "./db";
import { deleteChatMediaFile, mediaFilenameFromUrl } from "./chatMediaAccess";
import { publishChatEvent } from "./realtime";

let columnsReady = false;

export async function ensureDisappearingMessageColumns(): Promise<void> {
  if (columnsReady) return;
  await query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`);
  await query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_kept BOOLEAN NOT NULL DEFAULT FALSE`);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_messages_disappear_expiry
      ON messages (expires_at)
      WHERE expires_at IS NOT NULL AND is_kept = FALSE
  `);
  columnsReady = true;
}

/** SQL: message still visible (not past disappear timer unless kept). System messages always show. */
export function messageDisappearVisibleSql(): string {
  return `(m.type = 'system' OR m.expires_at IS NULL OR m.is_kept = TRUE OR m.expires_at > NOW())`;
}

export async function fetchChatDisappearSeconds(chatId: number | string): Promise<number | null> {
  const r = await query(`SELECT disappear_after_seconds FROM chats WHERE id = $1`, [chatId]);
  const raw = r.rows[0]?.disappear_after_seconds;
  if (raw == null || Number(raw) <= 0) return null;
  return Math.floor(Number(raw));
}

export function computeMessageExpiresAt(
  disappearSeconds: number | null | undefined,
  messageType: string | null | undefined,
): Date | null {
  if (!disappearSeconds || disappearSeconds <= 0) return null;
  const t = String(messageType ?? "text").toLowerCase();
  if (t === "system") return null;
  return new Date(Date.now() + disappearSeconds * 1000);
}

function collectMediaFilenames(mediaUrl: string | null, content: string | null, type: string): string[] {
  const names = new Set<string>();
  const add = (url: string | null | undefined) => {
    const f = mediaFilenameFromUrl(url ?? null);
    if (f) names.add(f);
  };
  add(mediaUrl);
  if (type === "album" || (content?.trim().startsWith("{") && content.includes('"urls"'))) {
    try {
      const parsed = JSON.parse(content ?? "") as { urls?: unknown[] };
      if (Array.isArray(parsed.urls)) {
        for (const u of parsed.urls) add(typeof u === "string" ? u : null);
      }
    } catch {
      /* ignore */
    }
  }
  return [...names];
}

export async function purgeExpiredDisappearingMessages(limit = 400): Promise<number> {
  await ensureDisappearingMessageColumns();
  const rows = await query(
    `SELECT id, chat_id, media_url, content, type
     FROM messages
     WHERE expires_at IS NOT NULL
       AND is_kept = FALSE
       AND expires_at <= NOW()
       AND type != 'system'
     ORDER BY expires_at ASC
     LIMIT $1`,
    [limit],
  );
  if (rows.rows.length === 0) return 0;

  const byChat = new Map<number, number[]>();
  for (const row of rows.rows as Array<{
    id: number;
    chat_id: number;
    media_url: string | null;
    content: string | null;
    type: string;
  }>) {
    const chatId = Number(row.chat_id);
    const messageId = Number(row.id);
    if (!Number.isFinite(chatId) || !Number.isFinite(messageId)) continue;
    const list = byChat.get(chatId) ?? [];
    list.push(messageId);
    byChat.set(chatId, list);
    for (const filename of collectMediaFilenames(row.media_url, row.content, row.type)) {
      await deleteChatMediaFile(filename).catch(() => {});
    }
  }

  const allIds = [...byChat.values()].flat();
  await query(`DELETE FROM messages WHERE id = ANY($1::int[])`, [allIds]);

  for (const [chatId, messageIds] of byChat) {
    const members = await query(`SELECT user_id FROM chat_members WHERE chat_id = $1`, [chatId]);
    const userIds = members.rows.map((r: { user_id: number }) => Number(r.user_id)).filter(Boolean);
    if (userIds.length === 0) continue;
    publishChatEvent({
      type: "message",
      chatId: String(chatId),
      userIds,
      payload: { action: "disappear_expired", messageIds: messageIds.map(String) },
    });
  }

  return allIds.length;
}

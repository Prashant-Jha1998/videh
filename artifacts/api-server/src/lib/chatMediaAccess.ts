import { query } from "./db";

export function mediaFilenameFromUrl(mediaUrl: string | null | undefined): string | null {
  if (!mediaUrl || mediaUrl.startsWith("data:")) return null;
  const m = mediaUrl.match(/\/media\/([^?#/]+)/i);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

let viewOnceColsReady = false;
export async function ensureViewOnceColumns(): Promise<void> {
  if (viewOnceColsReady) return;
  await query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS view_once_opened_at TIMESTAMPTZ`);
  await query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS view_once_opened_by INTEGER REFERENCES users(id)`);
  viewOnceColsReady = true;
}

/** Only chat members with a message referencing this file may stream it. */
export async function userCanAccessChatMedia(userId: number, filename: string): Promise<boolean> {
  if (!userId || !filename) return false;
  const r = await query(
    `SELECT 1
     FROM messages m
     JOIN chat_members cm ON cm.chat_id = m.chat_id AND cm.user_id = $2
     WHERE m.is_deleted = false
       AND m.media_url IS NOT NULL
       AND m.media_url LIKE '%' || $1 || '%'
       AND (NOT m.is_view_once OR m.view_once_opened_at IS NULL OR m.sender_id = $2)
     LIMIT 1`,
    [filename, userId],
  );
  return r.rows.length > 0;
}

export async function deleteChatMediaFile(filename: string): Promise<void> {
  if (!filename) return;
  await query(`DELETE FROM chat_media_files WHERE filename = $1`, [filename]);
}

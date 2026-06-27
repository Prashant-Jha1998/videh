import { query } from "./db";

/** Videh: chat history is kept for 90 days, then permanently removed. */
export const CHAT_MESSAGE_RETENTION_DAYS = 90;

/** SQL fragment — only messages within the retention window. */
export function messageWithinRetentionSql(messageAlias = "m"): string {
  return `${messageAlias}.created_at > NOW() - INTERVAL '${CHAT_MESSAGE_RETENTION_DAYS} days'`;
}

/** Permanently delete messages older than the retention window (batched). */
export async function purgeMessagesBeyondRetention(limit = 500): Promise<number> {
  const rows = await query(
    `SELECT id, media_url, content, type
     FROM messages
     WHERE created_at <= NOW() - INTERVAL '${CHAT_MESSAGE_RETENTION_DAYS} days'
       AND type != 'system'
     ORDER BY created_at ASC
     LIMIT $1`,
    [limit],
  );
  if (rows.rows.length === 0) return 0;

  const { deleteChatMediaFile, mediaFilenameFromUrl } = await import("./chatMediaAccess");

  const ids: number[] = [];
  for (const row of rows.rows as Array<{
    id: number;
    media_url: string | null;
    content: string | null;
    type: string;
  }>) {
    ids.push(Number(row.id));
    const add = (url: string | null | undefined) => {
      const f = mediaFilenameFromUrl(url ?? null);
      if (f) void deleteChatMediaFile(f).catch(() => {});
    };
    add(row.media_url);
    if (row.type === "album" || (row.content?.trim().startsWith("{") && row.content.includes('"urls"'))) {
      try {
        const parsed = JSON.parse(row.content ?? "") as { urls?: unknown[] };
        if (Array.isArray(parsed.urls)) {
          for (const u of parsed.urls) add(typeof u === "string" ? u : null);
        }
      } catch {
        /* ignore */
      }
    }
  }

  await query(`DELETE FROM messages WHERE id = ANY($1::int[])`, [ids]);
  return ids.length;
}

import { query } from "./db";

/** Delete expired statuses and orphaned status media blobs. Returns counts. */
export async function purgeExpiredStatuses(limit = 200): Promise<{ statuses: number; media: number }> {
  const expired = await query(
    `DELETE FROM statuses
     WHERE id IN (
       SELECT id FROM statuses
       WHERE expires_at < NOW() - INTERVAL '1 hour'
       ORDER BY expires_at ASC
       LIMIT $1
     )
     RETURNING id, media_url, editor_data`,
    [limit],
  );

  const filenames = new Set<string>();
  for (const row of expired.rows as { media_url?: string | null; editor_data?: unknown }[]) {
    const media = String(row.media_url ?? "");
    const m = media.match(/\/api\/statuses\/media\/([^/?#]+)/);
    if (m?.[1]) filenames.add(decodeURIComponent(m[1]));
    const ed = row.editor_data;
    const edText = typeof ed === "string" ? ed : JSON.stringify(ed ?? {});
    for (const match of edText.matchAll(/\/api\/statuses\/media\/([^\\/?#"']+)/g)) {
      if (match[1]) filenames.add(decodeURIComponent(match[1]));
    }
  }

  let mediaDeleted = 0;
  for (const filename of filenames) {
    const stillUsed = await query(
      `SELECT 1 FROM statuses
       WHERE media_url ILIKE '%' || $1 || '%'
          OR editor_data::text ILIKE '%' || $1 || '%'
       LIMIT 1`,
      [filename],
    );
    if (stillUsed.rows[0]) continue;
    const del = await query(`DELETE FROM status_media_files WHERE filename = $1 RETURNING filename`, [filename]);
    mediaDeleted += del.rows.length;
  }

  // Also purge orphan media older than 48h with no status reference.
  const orphans = await query(
    `DELETE FROM status_media_files sm
     WHERE sm.created_at < NOW() - INTERVAL '48 hours'
       AND NOT EXISTS (
         SELECT 1 FROM statuses s
         WHERE s.media_url ILIKE '%' || sm.filename || '%'
            OR s.editor_data::text ILIKE '%' || sm.filename || '%'
       )
       AND sm.filename IN (
         SELECT filename FROM status_media_files
         WHERE created_at < NOW() - INTERVAL '48 hours'
         ORDER BY created_at ASC
         LIMIT $1
       )
     RETURNING filename`,
    [limit],
  );
  mediaDeleted += orphans.rows.length;

  return { statuses: expired.rows.length, media: mediaDeleted };
}

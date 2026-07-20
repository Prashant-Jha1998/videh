import { query } from "./db";
import { areContacts, isBlocked } from "./presencePrivacy";
import { canSeeUserField, getExtendedPrivacy } from "./userPrivacySettings";

export type StatusAudienceMode = "all_contacts" | "selected_contacts";

let schemaEnsured = false;

export async function ensureStatusAudienceSchema(): Promise<void> {
  if (schemaEnsured) return;
  await query(`ALTER TABLE statuses ADD COLUMN IF NOT EXISTS audience_mode TEXT NOT NULL DEFAULT 'all_contacts'`);
  await query(`
    CREATE TABLE IF NOT EXISTS status_audience (
      status_id INTEGER NOT NULL REFERENCES statuses(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (status_id, user_id)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_status_audience_user ON status_audience (user_id, status_id)`);
  try {
    await query(`ALTER TABLE status_media_files ADD COLUMN IF NOT EXISTS uploader_id INTEGER REFERENCES users(id) ON DELETE SET NULL`);
  } catch {
    /* table may not exist yet; upload path creates it */
  }
  try {
    await query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_status_boosts_payment_reference_unique
        ON status_boosts (payment_reference)
        WHERE payment_reference IS NOT NULL AND payment_reference <> ''
    `);
  } catch {
    /* boosts table may not exist yet */
  }
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_city TEXT`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_state TEXT`);
  schemaEnsured = true;
}

export function normalizeAudienceMode(v: unknown): StatusAudienceMode {
  return v === "selected_contacts" ? "selected_contacts" : "all_contacts";
}

/**
 * Public path for status media.
 * Trailing `/content` avoids nginx static-asset regex locations matching `*.jpg`/`*.png`
 * and returning HTML 404 instead of proxying to the API.
 */
export function statusMediaPublicPath(filename: string): string {
  const safe = String(filename ?? "").replace(/\\/g, "/").split("/").pop() ?? "";
  if (!safe) return "/api/statuses/media/";
  return `/api/statuses/media/${encodeURIComponent(safe)}/content`;
}

export function extractStatusMediaFilename(mediaUrl: unknown): string | null {
  const raw = String(mediaUrl ?? "").trim();
  if (!raw) return null;
  try {
    const pathPart = raw.includes("://") ? new URL(raw).pathname : raw.split("?")[0] ?? raw;
    const marker = "/api/statuses/media/";
    const idx = pathPart.indexOf(marker);
    if (idx < 0) return null;
    let rest = pathPart.slice(idx + marker.length).replace(/\/+$/, "");
    // Newer URLs: /api/statuses/media/<file>/content
    if (rest.endsWith("/content")) {
      rest = rest.slice(0, -"/content".length).replace(/\/+$/, "");
    }
    if (!rest) return null;
    return decodeURIComponent(rest);
  } catch {
    return null;
  }
}

/** Media must be an uploaded status file owned by this user (blocks arbitrary remote URLs). */
export async function assertOwnedStatusMediaUrl(userId: number, mediaUrl: string | null | undefined): Promise<string | null> {
  if (!mediaUrl) return null;
  const filename = extractStatusMediaFilename(mediaUrl);
  if (!filename) {
    throw new Error("Story media must be uploaded through Videh.");
  }
  await ensureStatusAudienceSchema();
  const result = await query(
    `SELECT filename, uploader_id FROM status_media_files WHERE filename = $1`,
    [filename],
  );
  const row = result.rows[0] as { filename: string; uploader_id: number | null } | undefined;
  if (!row) throw new Error("Story media not found.");
  if (row.uploader_id != null && Number(row.uploader_id) !== Number(userId)) {
    throw new Error("Story media does not belong to this account.");
  }
  if (row.uploader_id == null) {
    await query(`UPDATE status_media_files SET uploader_id = $1 WHERE filename = $2 AND uploader_id IS NULL`, [
      userId,
      filename,
    ]);
  }
  return statusMediaPublicPath(filename);
}

async function isDmContact(viewerId: number, ownerId: number): Promise<boolean> {
  if (await areContacts(viewerId, ownerId)) return true;
  const r = await query(
    `SELECT 1
     FROM chat_members cm_self
     JOIN chat_members cm_other ON cm_other.chat_id = cm_self.chat_id
     JOIN chats c ON c.id = cm_self.chat_id
     WHERE cm_self.user_id = $1
       AND cm_other.user_id = $2
       AND c.is_group = FALSE
     LIMIT 1`,
    [viewerId, ownerId],
  );
  return r.rows.length > 0;
}

async function isInSelectedAudience(statusId: number, viewerId: number): Promise<boolean> {
  const r = await query(
    `SELECT 1 FROM status_audience WHERE status_id = $1 AND user_id = $2 LIMIT 1`,
    [statusId, viewerId],
  );
  return r.rows.length > 0;
}

type ActiveBoost = {
  target_city: string | null;
  target_state: string | null;
};

async function getActiveBoost(statusId: number): Promise<ActiveBoost | null> {
  const r = await query(
    `SELECT target_city, target_state
     FROM status_boosts
     WHERE status_id = $1 AND status = 'active' AND ends_at > NOW()
     ORDER BY ends_at DESC
     LIMIT 1`,
    [statusId],
  );
  return (r.rows[0] as ActiveBoost | undefined) ?? null;
}

async function matchesBoostGeo(viewerId: number, boost: ActiveBoost): Promise<boolean> {
  const city = boost.target_city?.trim();
  const state = boost.target_state?.trim();
  if (!city && !state) return true;
  const u = await query(`SELECT profile_city, profile_state FROM users WHERE id = $1`, [viewerId]);
  const row = u.rows[0] as { profile_city?: string | null; profile_state?: string | null } | undefined;
  if (!row) return false;
  const viewerCity = String(row.profile_city ?? "").trim().toLowerCase();
  const viewerState = String(row.profile_state ?? "").trim().toLowerCase();
  // If viewer has no profile geo, allow boost reach (cannot enforce radius without lat/lng).
  if (!viewerCity && !viewerState) return true;
  if (city && viewerCity && viewerCity !== city.toLowerCase()) return false;
  if (state && viewerState && viewerState !== state.toLowerCase()) return false;
  return true;
}

/**
 * Whether viewer may open / view / react to a status (active, non-blocked, audience + privacy).
 * Active paid boosts may reach beyond contacts (privacy exception), subject to optional city/state.
 */
export async function canViewerAccessStatus(
  viewerId: number,
  statusId: number,
  opts?: { allowExpired?: boolean },
): Promise<boolean> {
  await ensureStatusAudienceSchema();
  const result = await query(
    `SELECT id, user_id, audience_mode, expires_at
     FROM statuses WHERE id = $1`,
    [statusId],
  );
  const row = result.rows[0] as
    | { id: number; user_id: number; audience_mode: string; expires_at: string | Date }
    | undefined;
  if (!row) return false;

  const ownerId = Number(row.user_id);
  if (ownerId === viewerId) return true;

  if (!opts?.allowExpired && new Date(row.expires_at).getTime() <= Date.now()) return false;
  if (await isBlocked(viewerId, ownerId)) return false;

  const audienceMode = normalizeAudienceMode(row.audience_mode);
  if (audienceMode === "selected_contacts") {
    return isInSelectedAudience(Number(statusId), viewerId);
  }

  const contact = await isDmContact(viewerId, ownerId);
  const boost = await getActiveBoost(Number(statusId));

  if (contact) {
    return canSeeUserField(viewerId, ownerId, "status_privacy");
  }

  if (boost) {
    // Paid boost: allow non-contacts when privacy is contacts/everyone (not nobody).
    if (!(await matchesBoostGeo(viewerId, boost))) return false;
    const ext = await getExtendedPrivacy(ownerId);
    if (!ext || ext.status_privacy === "nobody") return false;
    return true;
  }

  return false;
}

/** Access for reply-context / historical: owner, eligible viewer, or participant in a chat that already has a status reply. */
export async function canViewerAccessStatusReplyContext(viewerId: number, statusId: number): Promise<boolean> {
  if (await canViewerAccessStatus(viewerId, statusId, { allowExpired: true })) return true;
  const r = await query(
    `SELECT 1
     FROM messages m
     JOIN chat_members cm ON cm.chat_id = m.chat_id AND cm.user_id = $2
     WHERE m.status_reply_id = $1
     LIMIT 1`,
    [statusId, viewerId],
  );
  return r.rows.length > 0;
}

export async function canViewerAccessStatusMedia(
  viewerId: number,
  filename: string,
  opts?: { statusId?: number },
): Promise<boolean> {
  await ensureStatusAudienceSchema();
  let safe = filename.replace(/\\/g, "/").split("/").pop() ?? "";
  try {
    safe = decodeURIComponent(safe);
  } catch {
    /* keep raw */
  }
  if (!safe) return false;

  const owned = await query(
    `SELECT uploader_id FROM status_media_files WHERE filename = $1`,
    [safe],
  );
  const media = owned.rows[0] as { uploader_id: number | null } | undefined;
  if (!media) return false;
  if (media.uploader_id != null && Number(media.uploader_id) === viewerId) return true;

  // Direct path: viewer already opened a specific status (most reliable for other users).
  if (opts?.statusId && Number.isFinite(opts.statusId) && opts.statusId > 0) {
    if (await canViewerAccessStatus(viewerId, opts.statusId, { allowExpired: true })) {
      const st = await query(
        `SELECT media_url, editor_data FROM statuses WHERE id = $1`,
        [opts.statusId],
      );
      const row = st.rows[0] as { media_url?: string | null; editor_data?: unknown } | undefined;
      if (row) {
        const main = extractStatusMediaFilename(row.media_url);
        if (main === safe) return true;
        const ed = typeof row.editor_data === "string"
          ? row.editor_data
          : JSON.stringify(row.editor_data ?? {});
        if (ed.includes(safe)) return true;
      }
    }
  }

  // Match statuses whose media_url path ends with this filename (avoid brittle ILIKE alone).
  const linked = await query(
    `SELECT s.id, s.media_url, s.editor_data
     FROM statuses s
     WHERE s.expires_at > NOW() - INTERVAL '3 days'
       AND (
         s.media_url ILIKE '%' || $1
         OR s.media_url ILIKE '%' || $1 || '?%'
         OR (s.editor_data::text ILIKE '%' || $1 || '%')
       )
     ORDER BY s.created_at DESC
     LIMIT 20`,
    [safe],
  );
  for (const row of linked.rows as { id: number; media_url?: string | null; editor_data?: unknown }[]) {
    const main = extractStatusMediaFilename(row.media_url);
    const ed = typeof row.editor_data === "string"
      ? row.editor_data
      : JSON.stringify(row.editor_data ?? {});
    if (main !== safe && !ed.includes(safe)) continue;
    if (await canViewerAccessStatus(viewerId, Number(row.id), { allowExpired: true })) return true;
  }

  const older = await query(
    `SELECT s.id, s.media_url, s.editor_data
     FROM statuses s
     WHERE s.media_url ILIKE '%' || $1
        OR s.media_url ILIKE '%' || $1 || '?%'
        OR (s.editor_data::text ILIKE '%' || $1 || '%')
     ORDER BY s.created_at DESC
     LIMIT 10`,
    [safe],
  );
  for (const row of older.rows as { id: number; media_url?: string | null; editor_data?: unknown }[]) {
    const main = extractStatusMediaFilename(row.media_url);
    const ed = typeof row.editor_data === "string"
      ? row.editor_data
      : JSON.stringify(row.editor_data ?? {});
    if (main !== safe && !ed.includes(safe)) continue;
    if (await canViewerAccessStatus(viewerId, Number(row.id), { allowExpired: true })) return true;
  }
  return false;
}

export async function setStatusAudience(
  statusId: number,
  mode: StatusAudienceMode,
  audienceUserIds: number[],
): Promise<void> {
  await ensureStatusAudienceSchema();
  await query(`UPDATE statuses SET audience_mode = $1 WHERE id = $2`, [mode, statusId]);
  await query(`DELETE FROM status_audience WHERE status_id = $1`, [statusId]);
  if (mode !== "selected_contacts") return;
  const unique = [...new Set(audienceUserIds.map(Number).filter((n) => Number.isFinite(n) && n > 0))];
  for (const uid of unique) {
    await query(
      `INSERT INTO status_audience (status_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [statusId, uid],
    );
  }
}

import { randomBytes } from "node:crypto";
import { query } from "./db";

function videoPublicBase(): string {
  const videoHost = (process.env["PUBLIC_VIDEO_DOMAIN"] || "video.videh.co.in").trim();
  return /^https?:\/\//i.test(videoHost)
    ? videoHost.replace(/\/+$/, "")
    : `https://${videoHost}`;
}

function normalizeChannelHandle(handle: string): string {
  return handle.replace(/^@+/, "").trim().toLowerCase();
}

/** Opaque public token — never expose numeric video id in share URLs. */
export function generateReelsVideoShareSlug(): string {
  return randomBytes(9).toString("base64url");
}

let shareSlugsEnsured = false;

/** Add share_slug column and backfill existing videos. */
export async function ensureReelsShareSlugs(): Promise<void> {
  if (shareSlugsEnsured) return;
  await query(`ALTER TABLE reels_videos ADD COLUMN IF NOT EXISTS share_slug VARCHAR(24)`);
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_reels_videos_share_slug
    ON reels_videos (share_slug)
    WHERE share_slug IS NOT NULL
  `);
  for (let pass = 0; pass < 8; pass++) {
    const missing = await query(
      `SELECT id FROM reels_videos WHERE share_slug IS NULL OR share_slug = '' LIMIT 200`,
    );
    if (!missing.rows.length) break;
    for (const row of missing.rows as Array<{ id: number }>) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const slug = generateReelsVideoShareSlug();
        try {
          await query(`UPDATE reels_videos SET share_slug = $1 WHERE id = $2`, [slug, row.id]);
          break;
        } catch {
          /* unique collision — retry */
        }
      }
    }
  }
  shareSlugsEnsured = true;
}

export function reelsVideoPublicShareRef(
  row: { id?: unknown; share_slug?: unknown },
): string {
  const slug = String(row.share_slug ?? "").trim();
  return slug || String(row.id ?? "");
}

/** Resolve numeric id from public share ref (slug or legacy numeric). */
export async function resolveReelsVideoIdFromRef(ref: string): Promise<number | null> {
  const trimmed = String(ref ?? "").trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) {
    const n = Number(trimmed);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const r = await query(`SELECT id FROM reels_videos WHERE share_slug = $1`, [trimmed]);
  const id = Number((r.rows[0] as { id?: number } | undefined)?.id);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/** Public HTTPS watch URL — video.videh.co.in (opaque slug, not numeric id). */
export function buildReelsVideoShareUrl(shareRef: string | number): string {
  return `${videoPublicBase()}/watch/${encodeURIComponent(String(shareRef))}`;
}

export function buildReelsVideoDeepLink(shareRef: string | number): string {
  return `videh://reels/watch/${encodeURIComponent(String(shareRef))}`;
}

/** Public channel page — opens in Videh Video web or app. */
export function buildReelsChannelShareUrl(handle: string): string {
  const h = normalizeChannelHandle(handle);
  return `${videoPublicBase()}/@${encodeURIComponent(h)}`;
}

export function buildReelsChannelDeepLink(handle: string): string {
  const h = normalizeChannelHandle(handle);
  return `videh://reels/channel/${encodeURIComponent(h)}`;
}

/** API landing page when shared outside the app (Play Store fallback + deep link). */
export function buildReelsChannelGoUrl(handle: string, apiOrigin?: string): string {
  const h = normalizeChannelHandle(handle);
  const origin = (apiOrigin ?? process.env["PUBLIC_API_ORIGIN"] ?? "https://videh.co.in").replace(/\/+$/, "");
  return `${origin}/api/reels/go/channel/${encodeURIComponent(h)}`;
}

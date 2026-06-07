import { query } from "./db";

let ensured = false;

export async function ensureReelsTables(): Promise<void> {
  if (ensured) return;
  await query(`
    CREATE TABLE IF NOT EXISTS reels_channels (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      handle VARCHAR(30) NOT NULL UNIQUE,
      avatar_url TEXT,
      bio TEXT,
      subscriber_count INTEGER NOT NULL DEFAULT 0,
      total_views BIGINT NOT NULL DEFAULT 0,
      total_view_hours NUMERIC(14, 2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS reels_videos (
      id SERIAL PRIMARY KEY,
      channel_id INTEGER NOT NULL REFERENCES reels_channels(id) ON DELETE CASCADE,
      title VARCHAR(200) NOT NULL,
      description TEXT,
      hashtags TEXT[] NOT NULL DEFAULT '{}',
      video_url TEXT NOT NULL,
      thumbnail_url TEXT,
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      view_count BIGINT NOT NULL DEFAULT 0,
      like_count INTEGER NOT NULL DEFAULT 0,
      dislike_count INTEGER NOT NULL DEFAULT 0,
      comment_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS reels_subscriptions (
      subscriber_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      channel_id INTEGER NOT NULL REFERENCES reels_channels(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (subscriber_user_id, channel_id)
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS reels_video_reactions (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      video_id INTEGER NOT NULL REFERENCES reels_videos(id) ON DELETE CASCADE,
      reaction VARCHAR(10) NOT NULL CHECK (reaction IN ('like', 'dislike')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, video_id)
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS reels_video_comments (
      id SERIAL PRIMARY KEY,
      video_id INTEGER NOT NULL REFERENCES reels_videos(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS reels_video_views (
      id SERIAL PRIMARY KEY,
      video_id INTEGER NOT NULL REFERENCES reels_videos(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      watched_seconds INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await ensureReelsAdminColumns();
  await ensureReelsModerationColumns();
  await ensureReelsChannelBrandingColumns();
  await ensureReelsChannelLinksPlaylists();
  const { ensureReelsAdsTables } = await import("./reelsAdsSchema");
  await ensureReelsAdsTables();
  ensured = true;
}

let adminColsEnsured = false;

export async function ensureReelsAdminColumns(): Promise<void> {
  if (adminColsEnsured) return;
  await query(`ALTER TABLE reels_channels ADD COLUMN IF NOT EXISTS total_likes BIGINT NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE reels_channels ADD COLUMN IF NOT EXISTS total_comments BIGINT NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE reels_channels ADD COLUMN IF NOT EXISTS total_shares BIGINT NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE reels_channels ADD COLUMN IF NOT EXISTS fraud_score NUMERIC(6, 2) NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE reels_channels ADD COLUMN IF NOT EXISTS monetization_status VARCHAR(24) NOT NULL DEFAULT 'not_eligible'`);
  await query(`ALTER TABLE reels_channels ADD COLUMN IF NOT EXISTS monetization_eligible BOOLEAN NOT NULL DEFAULT FALSE`);
  await query(`ALTER TABLE reels_videos ADD COLUMN IF NOT EXISTS share_count INTEGER NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE reels_videos ADD COLUMN IF NOT EXISTS fraud_score NUMERIC(6, 2) NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE reels_videos ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'published'`);
  await query(`ALTER TABLE reels_videos ADD COLUMN IF NOT EXISTS play_enabled BOOLEAN NOT NULL DEFAULT TRUE`);
  await query(`
    CREATE TABLE IF NOT EXISTS reels_platform_config (
      id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      config JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by TEXT
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS reels_video_shares (
      id SERIAL PRIMARY KEY,
      video_id INTEGER NOT NULL REFERENCES reels_videos(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS reels_fraud_events (
      id SERIAL PRIMARY KEY,
      entity_type VARCHAR(20) NOT NULL,
      entity_id INTEGER NOT NULL,
      signal_type VARCHAR(40) NOT NULL,
      score_delta NUMERIC(6, 2) NOT NULL DEFAULT 0,
      details JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS reels_view_sessions (
      id SERIAL PRIMARY KEY,
      video_id INTEGER NOT NULL REFERENCES reels_videos(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      ip_hash TEXT,
      watched_seconds INTEGER NOT NULL DEFAULT 0,
      counted_as_view BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  adminColsEnsured = true;
}

let moderationColsEnsured = false;

export async function ensureReelsModerationColumns(): Promise<void> {
  if (moderationColsEnsured) return;
  await query(`ALTER TABLE reels_videos ADD COLUMN IF NOT EXISTS moderation_status VARCHAR(24) NOT NULL DEFAULT 'pending_scan'`);
  await query(`ALTER TABLE reels_videos ADD COLUMN IF NOT EXISTS moderation_reason TEXT`);
  await query(`ALTER TABLE reels_videos ADD COLUMN IF NOT EXISTS moderation_scanned_at TIMESTAMPTZ`);
  await query(`ALTER TABLE reels_videos ADD COLUMN IF NOT EXISTS nsfw_score NUMERIC(5, 4) NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE reels_videos ADD COLUMN IF NOT EXISTS moderation_details JSONB`);
  await query(`
    CREATE TABLE IF NOT EXISTS reels_moderation_log (
      id SERIAL PRIMARY KEY,
      video_id INTEGER REFERENCES reels_videos(id) ON DELETE CASCADE,
      scan_type VARCHAR(32) NOT NULL,
      result VARCHAR(16) NOT NULL,
      score NUMERIC(5, 4),
      details JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_reels_videos_moderation ON reels_videos (moderation_status, created_at DESC)`);
  moderationColsEnsured = true;
}

let brandingColsEnsured = false;

export async function ensureReelsChannelBrandingColumns(): Promise<void> {
  if (brandingColsEnsured) return;
  await query(`ALTER TABLE reels_channels ADD COLUMN IF NOT EXISTS display_name VARCHAR(80)`);
  await query(`ALTER TABLE reels_channels ADD COLUMN IF NOT EXISTS cover_url TEXT`);
  brandingColsEnsured = true;
}

const HANDLE_RE = /^[a-zA-Z][a-zA-Z0-9_]{2,29}$/;

let linksPlaylistsEnsured = false;

export async function ensureReelsChannelLinksPlaylists(): Promise<void> {
  if (linksPlaylistsEnsured) return;
  await query(`
    CREATE TABLE IF NOT EXISTS reels_channel_links (
      id SERIAL PRIMARY KEY,
      channel_id INTEGER NOT NULL REFERENCES reels_channels(id) ON DELETE CASCADE,
      title VARCHAR(120) NOT NULL,
      url TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_reels_channel_links_channel
    ON reels_channel_links (channel_id, sort_order)
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS reels_playlists (
      id SERIAL PRIMARY KEY,
      channel_id INTEGER NOT NULL REFERENCES reels_channels(id) ON DELETE CASCADE,
      title VARCHAR(200) NOT NULL,
      description TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_reels_playlists_channel
    ON reels_playlists (channel_id, created_at DESC)
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS reels_playlist_items (
      playlist_id INTEGER NOT NULL REFERENCES reels_playlists(id) ON DELETE CASCADE,
      video_id INTEGER NOT NULL REFERENCES reels_videos(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (playlist_id, video_id)
    )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_reels_playlist_items_playlist
    ON reels_playlist_items (playlist_id, sort_order)
  `);
  linksPlaylistsEnsured = true;
}

export function normalizeReelsHandle(raw: string): string | null {
  const trimmed = String(raw ?? "").trim().replace(/^@+/, "");
  if (!HANDLE_RE.test(trimmed)) return null;
  return trimmed.toLowerCase();
}

/** No short cap — allow long uploads (up to ~4 hours metadata). */
export const MAX_REELS_VIDEO_SECONDS = 14400;

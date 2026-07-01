-- Opaque public share tokens for reels videos (no numeric id in URLs).

ALTER TABLE reels_videos ADD COLUMN IF NOT EXISTS share_slug VARCHAR(24);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reels_videos_share_slug
  ON reels_videos (share_slug)
  WHERE share_slug IS NOT NULL;


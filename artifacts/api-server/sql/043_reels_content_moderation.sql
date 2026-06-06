-- Automatic NSFW / sexual content scan before videos go public

ALTER TABLE reels_videos ADD COLUMN IF NOT EXISTS moderation_status VARCHAR(24) NOT NULL DEFAULT 'pending_scan';
ALTER TABLE reels_videos ADD COLUMN IF NOT EXISTS moderation_reason TEXT;
ALTER TABLE reels_videos ADD COLUMN IF NOT EXISTS moderation_scanned_at TIMESTAMPTZ;
ALTER TABLE reels_videos ADD COLUMN IF NOT EXISTS nsfw_score NUMERIC(5, 4) NOT NULL DEFAULT 0;
ALTER TABLE reels_videos ADD COLUMN IF NOT EXISTS moderation_details JSONB;

CREATE TABLE IF NOT EXISTS reels_moderation_log (
  id SERIAL PRIMARY KEY,
  video_id INTEGER REFERENCES reels_videos(id) ON DELETE CASCADE,
  scan_type VARCHAR(32) NOT NULL,
  result VARCHAR(16) NOT NULL,
  score NUMERIC(5, 4),
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reels_videos_moderation ON reels_videos (moderation_status, created_at DESC);

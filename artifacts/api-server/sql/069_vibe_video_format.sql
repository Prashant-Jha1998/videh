-- Vibe (short) vs Watch (long) format + per-video comment/share toggles
ALTER TABLE reels_videos ADD COLUMN IF NOT EXISTS video_format VARCHAR(12) NOT NULL DEFAULT 'watch';
ALTER TABLE reels_videos ADD COLUMN IF NOT EXISTS comments_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE reels_videos ADD COLUMN IF NOT EXISTS shares_enabled BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_reels_videos_format ON reels_videos (video_format, status);

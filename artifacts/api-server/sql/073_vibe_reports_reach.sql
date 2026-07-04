-- Vibe: community reports reduce reach at 10, remove at 20.
-- Dedupe one report per user per video.

CREATE TABLE IF NOT EXISTS reels_video_reports (
  id SERIAL PRIMARY KEY,
  video_id INTEGER NOT NULL REFERENCES reels_videos(id) ON DELETE CASCADE,
  reporter_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reason VARCHAR(120) NOT NULL,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reels_video_reports_user_dedup
  ON reels_video_reports (video_id, reporter_user_id)
  WHERE reporter_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reels_video_reports_video
  ON reels_video_reports (video_id, created_at DESC);

ALTER TABLE reels_video_notifications
  DROP CONSTRAINT IF EXISTS reels_video_notifications_user_id_video_id_kind_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_reels_notif_engagement_dedup
  ON reels_video_notifications (user_id, video_id, kind)
  WHERE kind IN ('new_video', 'content_warning');

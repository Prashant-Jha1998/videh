-- Engagement notifications (like, comment, share, connect) for channel owners.
ALTER TABLE reels_video_notifications
  ADD COLUMN IF NOT EXISTS actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS actor_label VARCHAR(255),
  ADD COLUMN IF NOT EXISTS detail_text TEXT;

ALTER TABLE reels_video_notifications
  DROP CONSTRAINT IF EXISTS reels_video_notifications_user_id_video_id_kind_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_reels_notif_new_video_dedup
  ON reels_video_notifications (user_id, video_id)
  WHERE kind = 'new_video';

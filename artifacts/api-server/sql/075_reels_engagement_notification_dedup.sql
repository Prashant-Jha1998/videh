-- Dedupe engagement notifications per actor/video/kind (like, comment, share, connect).
CREATE UNIQUE INDEX IF NOT EXISTS idx_reels_notif_engagement_actor_dedup
  ON reels_video_notifications (user_id, video_id, kind, actor_user_id)
  WHERE kind IN ('video_like', 'video_comment', 'video_share', 'channel_connect')
    AND actor_user_id IS NOT NULL;

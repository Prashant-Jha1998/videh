-- Speed up watch history for library page
CREATE INDEX IF NOT EXISTS idx_reels_views_user_watched
ON reels_video_views (user_id, created_at DESC)
WHERE user_id IS NOT NULL;

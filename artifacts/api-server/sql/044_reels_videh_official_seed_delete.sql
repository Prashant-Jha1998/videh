-- Delete all fake/old @videh seed videos (Google/Mixkit sample links).
-- Safe: only removes rows tagged videh_official_seed.

DO $$
DECLARE
  v_channel_id INTEGER;
  v_deleted INTEGER;
BEGIN
  SELECT c.id INTO v_channel_id
  FROM reels_channels c
  JOIN users u ON u.id = c.user_id
  WHERE regexp_replace(COALESCE(u.phone, ''), '\D', '', 'g') LIKE '%9625692122'
  ORDER BY c.id
  LIMIT 1;

  IF v_channel_id IS NULL THEN
    RAISE NOTICE 'No @videh channel found for 9625692122 — nothing deleted.';
    RETURN;
  END IF;

  DELETE FROM reels_moderation_log
  WHERE video_id IN (
    SELECT id FROM reels_videos
    WHERE channel_id = v_channel_id AND 'videh_official_seed' = ANY(hashtags)
  );

  DELETE FROM reels_videos
  WHERE channel_id = v_channel_id
    AND 'videh_official_seed' = ANY(hashtags);

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  UPDATE reels_channels c SET
    total_views = COALESCE(s.sum_views, 0),
    total_view_hours = COALESCE(s.sum_hours, 0),
    total_likes = COALESCE(s.sum_likes, 0),
    total_comments = COALESCE(s.sum_comments, 0),
    total_shares = COALESCE(s.sum_shares, 0),
    updated_at = NOW()
  FROM (
    SELECT
      SUM(view_count) AS sum_views,
      SUM((view_count::numeric * LEAST(duration_seconds, 300)) / 3600.0) AS sum_hours,
      SUM(like_count) AS sum_likes,
      SUM(comment_count) AS sum_comments,
      SUM(share_count) AS sum_shares
    FROM reels_videos
    WHERE channel_id = v_channel_id
  ) s
  WHERE c.id = v_channel_id;

  RAISE NOTICE 'Deleted % seed videos from @videh channel id=%.', v_deleted, v_channel_id;
END $$;

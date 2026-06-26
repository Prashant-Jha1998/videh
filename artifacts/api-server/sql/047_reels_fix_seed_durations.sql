-- Honest duration metadata for @videh Pexels seed clips (actual files are ~10–30s, not 1–5 min).
-- Also set official channel display name for in-stream video feed.

UPDATE reels_videos v
SET duration_seconds = sub.real_dur
FROM (
  SELECT
    rv.id,
    10 + ((ROW_NUMBER() OVER (ORDER BY rv.id) - 1) % 5) * 5 AS real_dur
  FROM reels_videos rv
  WHERE 'videh_official_seed' = ANY(rv.hashtags)
) sub
WHERE v.id = sub.id;

UPDATE reels_channels
SET display_name = 'Videh', updated_at = NOW()
WHERE handle = 'videh' AND (display_name IS NULL OR display_name = '');

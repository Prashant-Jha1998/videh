-- Videh video feed algorithm: likes/comments boost reach; monetization watch hours 4,000.
UPDATE reels_platform_config
SET config = config
  || jsonb_build_object(
    'monetization', COALESCE(config->'monetization', '{}'::jsonb) || jsonb_build_object(
      'minWatchHours', 4000,
      'summary', jsonb_build_array(
        'At least 500 subscribers on your channel',
        'At least 4,000 valid watch hours in the last 12 months',
        'At least 5 public videos on your channel',
        'Channel in good standing (low fraud score, no policy strikes)',
        'Videh may review your channel before ads run on your videos'
      )
    ),
    'feed', COALESCE(config->'feed', '{}'::jsonb) || jsonb_build_object(
      'weightLikes', 8,
      'weightComments', 12,
      'weightWatchHours', 4,
      'summary', jsonb_build_array(
        'New videos from channels you subscribe to appear first',
        'Recent uploads within 48 hours get a freshness boost',
        'Likes tell Videh the video is worth showing to more people',
        'Comments boost engagement and help the video reach more viewers',
        'Watch time still matters, but likes and comments weigh more in ranking',
        'Suspected fake engagement reduces visibility'
      )
    )
  ),
  updated_at = NOW()
WHERE id = 1;

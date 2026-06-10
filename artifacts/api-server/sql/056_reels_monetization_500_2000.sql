-- Videh Creator Program: 500 subscribers + 2,000 watch hours (half of typical 1k/4k tiers).
UPDATE reels_platform_config
SET config = config
  || jsonb_build_object(
    'monetization', COALESCE(config->'monetization', '{}'::jsonb) || jsonb_build_object(
      'minSubscribers', 500,
      'minWatchHours', 2000,
      'summary', jsonb_build_array(
        'At least 500 subscribers on your channel',
        'At least 2,000 valid watch hours in the last 12 months',
        'At least 5 public videos on your channel',
        'Channel in good standing (low fraud score, no policy strikes)',
        'Videh may review your channel before ads run on your videos'
      )
    )
  ),
  updated_at = NOW()
WHERE id = 1;

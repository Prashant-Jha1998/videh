-- Videh Creator Program: 500 subscribers + 2,000 watch hours.
-- Run on the SAME database as Videh API (DATABASE_URL), not the default "postgres" DB.
-- Quick check first:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' AND table_name IN ('users', 'reels_channels', 'reels_platform_config');

CREATE TABLE IF NOT EXISTS reels_platform_config (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);

INSERT INTO reels_platform_config (id, config)
VALUES (1, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

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

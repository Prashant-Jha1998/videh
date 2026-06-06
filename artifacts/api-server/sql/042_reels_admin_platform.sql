-- Reels admin: platform rules, fraud tracking, extended channel stats

ALTER TABLE reels_channels ADD COLUMN IF NOT EXISTS total_likes BIGINT NOT NULL DEFAULT 0;
ALTER TABLE reels_channels ADD COLUMN IF NOT EXISTS total_comments BIGINT NOT NULL DEFAULT 0;
ALTER TABLE reels_channels ADD COLUMN IF NOT EXISTS total_shares BIGINT NOT NULL DEFAULT 0;
ALTER TABLE reels_channels ADD COLUMN IF NOT EXISTS fraud_score NUMERIC(6, 2) NOT NULL DEFAULT 0;
ALTER TABLE reels_channels ADD COLUMN IF NOT EXISTS monetization_status VARCHAR(24) NOT NULL DEFAULT 'not_eligible';
ALTER TABLE reels_channels ADD COLUMN IF NOT EXISTS monetization_eligible BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE reels_videos ADD COLUMN IF NOT EXISTS share_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE reels_videos ADD COLUMN IF NOT EXISTS fraud_score NUMERIC(6, 2) NOT NULL DEFAULT 0;
ALTER TABLE reels_videos ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'published';
ALTER TABLE reels_videos ADD COLUMN IF NOT EXISTS play_enabled BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS reels_platform_config (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);

INSERT INTO reels_platform_config (id, config) VALUES (1, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS reels_video_shares (
  id SERIAL PRIMARY KEY,
  video_id INTEGER NOT NULL REFERENCES reels_videos(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reels_shares_video ON reels_video_shares (video_id, created_at DESC);

CREATE TABLE IF NOT EXISTS reels_fraud_events (
  id SERIAL PRIMARY KEY,
  entity_type VARCHAR(20) NOT NULL,
  entity_id INTEGER NOT NULL,
  signal_type VARCHAR(40) NOT NULL,
  score_delta NUMERIC(6, 2) NOT NULL DEFAULT 0,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reels_fraud_entity ON reels_fraud_events (entity_type, entity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS reels_view_sessions (
  id SERIAL PRIMARY KEY,
  video_id INTEGER NOT NULL REFERENCES reels_videos(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ip_hash TEXT,
  watched_seconds INTEGER NOT NULL DEFAULT 0,
  counted_as_view BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reels_view_sessions_lookup
  ON reels_view_sessions (video_id, user_id, created_at DESC);

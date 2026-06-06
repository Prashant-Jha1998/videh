-- Videh Reels / Video platform (YouTube-style channels)

CREATE TABLE IF NOT EXISTS reels_channels (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  handle VARCHAR(30) NOT NULL UNIQUE,
  avatar_url TEXT,
  bio TEXT,
  subscriber_count INTEGER NOT NULL DEFAULT 0,
  total_views BIGINT NOT NULL DEFAULT 0,
  total_view_hours NUMERIC(14, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reels_channels_handle ON reels_channels (LOWER(handle));

CREATE TABLE IF NOT EXISTS reels_videos (
  id SERIAL PRIMARY KEY,
  channel_id INTEGER NOT NULL REFERENCES reels_channels(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  hashtags TEXT[] NOT NULL DEFAULT '{}',
  video_url TEXT NOT NULL,
  thumbnail_url TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  view_count BIGINT NOT NULL DEFAULT 0,
  like_count INTEGER NOT NULL DEFAULT 0,
  dislike_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reels_videos_channel ON reels_videos (channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reels_videos_created ON reels_videos (created_at DESC);

CREATE TABLE IF NOT EXISTS reels_subscriptions (
  subscriber_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel_id INTEGER NOT NULL REFERENCES reels_channels(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (subscriber_user_id, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_reels_subs_channel ON reels_subscriptions (channel_id);

CREATE TABLE IF NOT EXISTS reels_video_reactions (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_id INTEGER NOT NULL REFERENCES reels_videos(id) ON DELETE CASCADE,
  reaction VARCHAR(10) NOT NULL CHECK (reaction IN ('like', 'dislike')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, video_id)
);

CREATE TABLE IF NOT EXISTS reels_video_comments (
  id SERIAL PRIMARY KEY,
  video_id INTEGER NOT NULL REFERENCES reels_videos(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reels_comments_video ON reels_video_comments (video_id, created_at DESC);

CREATE TABLE IF NOT EXISTS reels_video_views (
  id SERIAL PRIMARY KEY,
  video_id INTEGER NOT NULL REFERENCES reels_videos(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  watched_seconds INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reels_views_video ON reels_video_views (video_id);

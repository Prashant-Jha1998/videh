-- Channel profile links (YouTube-style) and playlists
CREATE TABLE IF NOT EXISTS reels_channel_links (
  id SERIAL PRIMARY KEY,
  channel_id INTEGER NOT NULL REFERENCES reels_channels(id) ON DELETE CASCADE,
  title VARCHAR(120) NOT NULL,
  url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reels_channel_links_channel ON reels_channel_links (channel_id, sort_order);

CREATE TABLE IF NOT EXISTS reels_playlists (
  id SERIAL PRIMARY KEY,
  channel_id INTEGER NOT NULL REFERENCES reels_channels(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reels_playlists_channel ON reels_playlists (channel_id, created_at DESC);

CREATE TABLE IF NOT EXISTS reels_playlist_items (
  playlist_id INTEGER NOT NULL REFERENCES reels_playlists(id) ON DELETE CASCADE,
  video_id INTEGER NOT NULL REFERENCES reels_videos(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (playlist_id, video_id)
);

CREATE INDEX IF NOT EXISTS idx_reels_playlist_items_playlist ON reels_playlist_items (playlist_id, sort_order);

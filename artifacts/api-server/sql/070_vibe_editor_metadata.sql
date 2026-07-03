-- Vibe editor: filters, text overlays, sound metadata
ALTER TABLE reels_videos ADD COLUMN IF NOT EXISTS editor_metadata JSONB;
ALTER TABLE reels_videos ADD COLUMN IF NOT EXISTS music_title VARCHAR(200);
ALTER TABLE reels_videos ADD COLUMN IF NOT EXISTS music_artist VARCHAR(200);
ALTER TABLE reels_videos ADD COLUMN IF NOT EXISTS music_url TEXT;

-- Channel display name + cover photo (YouTube-style branding)

ALTER TABLE reels_channels ADD COLUMN IF NOT EXISTS display_name VARCHAR(80);
ALTER TABLE reels_channels ADD COLUMN IF NOT EXISTS cover_url TEXT;

-- Campaign schedule + geographic analytics for Videh Ads

ALTER TABLE reels_ad_campaigns
  ADD COLUMN IF NOT EXISTS start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS end_date DATE;

UPDATE reels_ad_campaigns
SET end_date = (created_at::date + INTERVAL '30 days')::date
WHERE end_date IS NULL;

ALTER TABLE reels_ad_impressions
  ADD COLUMN IF NOT EXISTS viewer_city VARCHAR(80),
  ADD COLUMN IF NOT EXISTS viewer_state VARCHAR(80),
  ADD COLUMN IF NOT EXISTS viewer_country VARCHAR(80) DEFAULT 'India';

CREATE INDEX IF NOT EXISTS idx_reels_ad_impressions_geo ON reels_ad_impressions (viewer_city, viewer_state);

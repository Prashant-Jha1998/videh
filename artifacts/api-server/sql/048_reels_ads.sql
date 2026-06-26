-- in-stream video reels video ads + advertiser portal (ads.videh.co.in)

CREATE TABLE IF NOT EXISTS reels_advertisers (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  company_name VARCHAR(120) NOT NULL,
  contact_name VARCHAR(80),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'pending')),
  balance_inr NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reels_ad_campaigns (
  id SERIAL PRIMARY KEY,
  advertiser_id INTEGER NOT NULL REFERENCES reels_advertisers(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'ended')),
  daily_budget_inr NUMERIC(12, 2) NOT NULL DEFAULT 500,
  total_budget_inr NUMERIC(12, 2) NOT NULL DEFAULT 5000,
  spent_inr NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reels_ad_creatives (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES reels_ad_campaigns(id) ON DELETE CASCADE,
  title VARCHAR(120) NOT NULL,
  video_url TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL DEFAULT 30,
  skip_after_seconds INTEGER,
  placement VARCHAR(16) NOT NULL DEFAULT 'any' CHECK (placement IN ('pre_roll', 'mid_roll', 'any')),
  ad_type VARCHAR(20) NOT NULL DEFAULT 'non_skippable' CHECK (ad_type IN ('non_skippable', 'skippable')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  impressions BIGINT NOT NULL DEFAULT 0,
  completions BIGINT NOT NULL DEFAULT 0,
  skips BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reels_ad_impressions (
  id SERIAL PRIMARY KEY,
  creative_id INTEGER NOT NULL REFERENCES reels_ad_creatives(id) ON DELETE CASCADE,
  content_video_id INTEGER REFERENCES reels_videos(id) ON DELETE SET NULL,
  viewer_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  placement VARCHAR(16) NOT NULL,
  watched_seconds INTEGER NOT NULL DEFAULT 0,
  skipped BOOLEAN NOT NULL DEFAULT FALSE,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reels_ad_creatives_active ON reels_ad_creatives (is_active, placement);
CREATE INDEX IF NOT EXISTS idx_reels_ad_impressions_creative ON reels_ad_impressions (creative_id, created_at DESC);

-- Platform seed creatives (Videh house ads) — idempotent by title
INSERT INTO reels_advertisers (email, password_hash, company_name, contact_name, status)
VALUES ('ads@videh.co.in', 'managed_by_admin', 'Videh Ads', 'Videh Team', 'active')
ON CONFLICT (email) DO NOTHING;

INSERT INTO reels_ad_campaigns (advertiser_id, name, status, daily_budget_inr, total_budget_inr)
SELECT a.id, 'Videh House Pre-roll', 'active', 10000, 100000
FROM reels_advertisers a WHERE a.email = 'ads@videh.co.in'
  AND NOT EXISTS (SELECT 1 FROM reels_ad_campaigns c WHERE c.name = 'Videh House Pre-roll');

INSERT INTO reels_ad_creatives (campaign_id, title, video_url, duration_seconds, skip_after_seconds, placement, ad_type)
SELECT c.id, 'Videh 30s Intro',
  'https://videos.pexels.com/video-files/3571264/3571264-uhd_2560_1440_25fps.mp4',
  30, NULL, 'pre_roll', 'non_skippable'
FROM reels_ad_campaigns c WHERE c.name = 'Videh House Pre-roll'
  AND NOT EXISTS (SELECT 1 FROM reels_ad_creatives cr WHERE cr.title = 'Videh 30s Intro');

INSERT INTO reels_ad_creatives (campaign_id, title, video_url, duration_seconds, skip_after_seconds, placement, ad_type)
SELECT c.id, 'Videh 60s Skippable',
  'https://videos.pexels.com/video-files/3195394/3195394-uhd_2560_1440_25fps.mp4',
  60, 5, 'pre_roll', 'skippable'
FROM reels_ad_campaigns c WHERE c.name = 'Videh House Pre-roll'
  AND NOT EXISTS (SELECT 1 FROM reels_ad_creatives cr WHERE cr.title = 'Videh 60s Skippable');

INSERT INTO reels_ad_creatives (campaign_id, title, video_url, duration_seconds, skip_after_seconds, placement, ad_type)
SELECT c.id, 'Videh Mid-roll',
  'https://videos.pexels.com/video-files/854424/854424-uhd_2560_1440_25fps.mp4',
  30, NULL, 'mid_roll', 'non_skippable'
FROM reels_ad_campaigns c WHERE c.name = 'Videh House Pre-roll'
  AND NOT EXISTS (SELECT 1 FROM reels_ad_creatives cr WHERE cr.title = 'Videh Mid-roll');

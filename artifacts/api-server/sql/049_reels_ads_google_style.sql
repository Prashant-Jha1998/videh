-- Google Ads / in-stream video feed ads: app install, shopping, image + billing

UPDATE reels_advertisers SET balance_inr = 100000 WHERE email = 'ads@videh.co.in' AND balance_inr < 1000;

ALTER TABLE reels_ad_campaigns
  ADD COLUMN IF NOT EXISTS objective VARCHAR(24) NOT NULL DEFAULT 'brand_awareness',
  ADD COLUMN IF NOT EXISTS bid_model VARCHAR(12) NOT NULL DEFAULT 'cpm',
  ADD COLUMN IF NOT EXISTS bid_amount_inr NUMERIC(10, 2) NOT NULL DEFAULT 120;

ALTER TABLE reels_ad_creatives
  ADD COLUMN IF NOT EXISTS format VARCHAR(20) NOT NULL DEFAULT 'video',
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS headline VARCHAR(120),
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS cta_type VARCHAR(20) NOT NULL DEFAULT 'learn_more',
  ADD COLUMN IF NOT EXISTS destination_url TEXT,
  ADD COLUMN IF NOT EXISTS play_store_url TEXT,
  ADD COLUMN IF NOT EXISTS app_store_url TEXT,
  ADD COLUMN IF NOT EXISTS app_name VARCHAR(80),
  ADD COLUMN IF NOT EXISTS clicks BIGINT NOT NULL DEFAULT 0;

ALTER TABLE reels_ad_creatives ALTER COLUMN video_url DROP NOT NULL;

ALTER TABLE reels_ad_impressions
  ADD COLUMN IF NOT EXISTS clicked BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cost_inr NUMERIC(10, 4) NOT NULL DEFAULT 0;

-- Expand placement to include feed_instream (between home feed videos)
DO $$
BEGIN
  ALTER TABLE reels_ad_creatives DROP CONSTRAINT IF EXISTS reels_ad_creatives_placement_check;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

ALTER TABLE reels_ad_creatives
  ADD CONSTRAINT reels_ad_creatives_placement_check
  CHECK (placement IN ('pre_roll', 'mid_roll', 'feed_instream', 'any'));

-- House feed ads (app + shopping samples)
INSERT INTO reels_ad_campaigns (advertiser_id, name, status, objective, bid_model, bid_amount_inr, daily_budget_inr, total_budget_inr)
SELECT a.id, 'Videh Feed Promotions', 'active', 'app_promotion', 'cpi', 45, 5000, 50000
FROM reels_advertisers a WHERE a.email = 'ads@videh.co.in'
  AND NOT EXISTS (SELECT 1 FROM reels_ad_campaigns c WHERE c.name = 'Videh Feed Promotions');

INSERT INTO reels_ad_creatives (
  campaign_id, title, format, image_url, headline, description, placement, ad_type,
  cta_type, app_name, play_store_url, app_store_url, duration_seconds
)
SELECT c.id, 'Install Videh App',
  'app_install',
  'https://videh.co.in/videh_icon_foreground.png',
  'Videh — Messenger & Video',
  'Chat, calls, and videos in one app. Free on Android & iOS.',
  'feed_instream', 'non_skippable', 'install', 'Videh',
  'https://play.google.com/store/apps/details?id=com.videh.app',
  'https://apps.apple.com/app/videh',
  0
FROM reels_ad_campaigns c WHERE c.name = 'Videh Feed Promotions'
  AND NOT EXISTS (SELECT 1 FROM reels_ad_creatives cr WHERE cr.title = 'Install Videh App');

INSERT INTO reels_ad_campaigns (advertiser_id, name, status, objective, bid_model, bid_amount_inr, daily_budget_inr, total_budget_inr)
SELECT a.id, 'Videh Shop Demo', 'active', 'shopping', 'cpc', 15, 3000, 30000
FROM reels_advertisers a WHERE a.email = 'ads@videh.co.in'
  AND NOT EXISTS (SELECT 1 FROM reels_ad_campaigns c WHERE c.name = 'Videh Shop Demo');

INSERT INTO reels_ad_creatives (
  campaign_id, title, format, image_url, headline, description, placement, ad_type,
  cta_type, destination_url, duration_seconds
)
SELECT c.id, 'Videh Merch',
  'shopping',
  'https://images.pexels.com/photos/5632402/pexels-photo-5632402.jpeg?auto=compress&cs=tinysrgb&w=800',
  'Premium Videh Gear',
  'Official merchandise — limited launch offer.',
  'feed_instream', 'non_skippable', 'shop_now',
  'https://videh.co.in',
  0
FROM reels_ad_campaigns c WHERE c.name = 'Videh Shop Demo'
  AND NOT EXISTS (SELECT 1 FROM reels_ad_creatives cr WHERE cr.title = 'Videh Merch');

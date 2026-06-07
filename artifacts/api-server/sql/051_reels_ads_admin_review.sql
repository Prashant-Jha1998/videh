-- Admin review before ads go public

ALTER TABLE reels_ad_creatives
  ADD COLUMN IF NOT EXISTS moderation_status VARCHAR(24) NOT NULL DEFAULT 'pending_review',
  ADD COLUMN IF NOT EXISTS moderation_reason TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(120);

-- Existing house / platform seed ads stay live
UPDATE reels_ad_creatives cr
SET moderation_status = 'approved', reviewed_at = NOW(), reviewed_by = 'system'
FROM reels_ad_campaigns camp
JOIN reels_advertisers adv ON adv.id = camp.advertiser_id
WHERE cr.campaign_id = camp.id
  AND adv.email = 'ads@videh.co.in';

-- Vibe swipe-feed ad placement (premium vertical ads on ads.videh.co.in)

DO $$
BEGIN
  ALTER TABLE reels_ad_creatives DROP CONSTRAINT IF EXISTS reels_ad_creatives_placement_check;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

ALTER TABLE reels_ad_creatives
  ADD CONSTRAINT reels_ad_creatives_placement_check
  CHECK (placement IN (
    'pre_roll', 'mid_roll', 'feed_instream', 'shorts_feed', 'vibe_feed',
    'search_promoted', 'channel_banner', 'video_overlay', 'any'
  ));

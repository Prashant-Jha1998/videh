-- All Videh ad placements & formats (video watch, feed, shorts, display)

DO $$
BEGIN
  ALTER TABLE reels_ad_creatives DROP CONSTRAINT IF EXISTS reels_ad_creatives_placement_check;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

ALTER TABLE reels_ad_creatives
  ADD CONSTRAINT reels_ad_creatives_placement_check
  CHECK (placement IN (
    'pre_roll', 'mid_roll', 'feed_instream', 'shorts_feed',
    'search_promoted', 'channel_banner', 'video_overlay', 'any'
  ));

DO $$
BEGIN
  ALTER TABLE reels_ad_creatives DROP CONSTRAINT IF EXISTS reels_ad_creatives_ad_type_check;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

ALTER TABLE reels_ad_creatives
  ADD CONSTRAINT reels_ad_creatives_ad_type_check
  CHECK (ad_type IN ('non_skippable', 'skippable', 'bumper'));

-- Official @videh channel seed for user 9625692122
-- 200 published demo videos so new users see content in the Video feed (not empty).
-- Safe to re-run: skips if 200 seed videos already exist.
-- Requires: 041, 042, 043 reels migrations.
-- Note: User must exist (login once with 9625692122) before running.

DO $$
DECLARE
  v_user_id INTEGER;
  v_channel_id INTEGER;
  v_seed_count INTEGER;
  v_inserted INTEGER;
BEGIN
  SELECT u.id INTO v_user_id
  FROM users u
  WHERE regexp_replace(COALESCE(u.phone, ''), '\D', '', 'g') LIKE '%9625692122'
  ORDER BY u.id
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE NOTICE '044_reels_videh_official_seed: user 9625692122 not found — register/login that number first, then re-run.';
    RETURN;
  END IF;

  INSERT INTO reels_channels (
    user_id, handle, avatar_url, bio,
    subscriber_count, total_views, total_view_hours,
    total_likes, total_comments, total_shares,
    fraud_score, monetization_status, monetization_eligible
  )
  VALUES (
    v_user_id,
    'videh',
    'https://videh.co.in/assets/videh-icon.png',
    'Official Videh channel — messenger tips, tutorials, privacy guides, and feature updates for India.',
    12840,
    0,
    0,
    0,
    0,
    0,
    0,
    'eligible',
    TRUE
  )
  ON CONFLICT (user_id) DO UPDATE SET
    handle = EXCLUDED.handle,
    bio = EXCLUDED.bio,
    monetization_status = 'eligible',
    monetization_eligible = TRUE,
    updated_at = NOW()
  RETURNING id INTO v_channel_id;

  IF v_channel_id IS NULL THEN
    SELECT id INTO v_channel_id FROM reels_channels WHERE user_id = v_user_id;
  END IF;

  SELECT COUNT(*)::int INTO v_seed_count
  FROM reels_videos
  WHERE channel_id = v_channel_id
    AND 'videh_official_seed' = ANY(hashtags);

  IF v_seed_count >= 200 THEN
    RAISE NOTICE '044_reels_videh_official_seed: already have % seed videos — skipping.', v_seed_count;
    RETURN;
  END IF;

  DELETE FROM reels_videos
  WHERE channel_id = v_channel_id
    AND 'videh_official_seed' = ANY(hashtags)
    AND v_seed_count > 0
    AND v_seed_count < 200;

  INSERT INTO reels_videos (
    channel_id, title, description, hashtags,
    video_url, thumbnail_url, duration_seconds,
    view_count, like_count, dislike_count, comment_count, share_count,
    fraud_score, status, play_enabled,
    moderation_status, moderation_scanned_at, nsfw_score,
    created_at
  )
  SELECT
    v_channel_id,
    tp.title_base || ' · Ep ' || (((gs.n - 1) / 20) + 1)::text,
    tp.desc_base || E'\n\n#Videh official tutorial #' || gs.n::text || E'. Subscribe @videh for more.',
    tp.base_tags || ARRAY['videh_official_seed', 'tutorial', ('ep' || gs.n::text)],
    vp.urls[1 + ((gs.n - 1) % array_length(vp.urls, 1))],
    'https://picsum.photos/seed/videh' || gs.n::text || '/1280/720',
    300,
    1500 + ((gs.n * 7919) % 185000),
    60 + ((gs.n * 3571) % 9200),
    (gs.n * 17) % 140,
    12 + ((gs.n * 997) % 480),
    (gs.n * 41) % 1100,
    0,
    'published',
    TRUE,
    'approved',
    NOW(),
    0,
    NOW() - ((201 - gs.n) * INTERVAL '9 hours')
  FROM generate_series(1, 200) AS gs(n)
  CROSS JOIN (
    SELECT ARRAY[
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4',
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4',
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/VolkswagenGTIReview.mp4',
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4',
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WhatCarCanYouGetForAGrand.mp4',
      'https://assets.mixkit.co/videos/preview/mixkit-aerial-view-of-a-road-with-cars-4456-large.mp4',
      'https://assets.mixkit.co/videos/preview/mixkit-waves-coming-to-the-shore-5016-large.mp4',
      'https://assets.mixkit.co/videos/preview/mixkit-countryside-meadow-4075-large.mp4',
      'https://assets.mixkit.co/videos/preview/mixkit-tree-with-yellow-flowers-1173-large.mp4',
      'https://assets.mixkit.co/videos/preview/mixkit-white-sand-beach-and-palm-trees-1564-large.mp4',
      'https://assets.mixkit.co/videos/preview/mixkit-aerial-panorama-of-a-landscape-with-mountains-4249-large.mp4',
      'https://assets.mixkit.co/videos/preview/mixkit-clouds-and-blue-sky-2408-large.mp4'
    ]::text[] AS urls
  ) vp
  JOIN (
    SELECT * FROM (VALUES
      (0,  'Videh Messenger — privacy settings guide', 'Set last seen, profile photo, and about privacy on Videh. Keep control of who sees your activity.', ARRAY['videh','privacy','messenger','hindi']),
      (1,  'Videh par group chat kaise banayein', 'Step-by-step: create groups, add members, set admin rules, and mute notifications.', ARRAY['videh','group','tutorial','hindi']),
      (2,  'Voice calls on Videh — crystal clear audio', 'How to start voice calls, use speaker mode, and fix common audio issues.', ARRAY['videh','voice','calls']),
      (3,  'Video calling tips — Videh HD calls', 'Better lighting, stable Wi‑Fi, and permissions for smooth video calls.', ARRAY['videh','video','calls','hd']),
      (4,  'Status updates — share photos & videos', 'Post 24-hour status, control viewers, and reply privately.', ARRAY['videh','status','stories']),
      (5,  'Khata ledger on Videh — track udhar & jama', 'Record daily entries, set reminders, and share Khata with family business.', ARRAY['videh','khata','business','hindi']),
      (6,  'Hey Videh assistant — voice commands', 'Use Hey Videh to send messages, call contacts, and open chats hands-free.', ARRAY['videh','assistant','ai','voice']),
      (7,  'Broadcast lists — message many at once', 'Create broadcast lists for offers, invites, and announcements safely.', ARRAY['videh','broadcast','tips']),
      (8,  'Share documents & PDF in chat', 'Send contracts, bills, and homework without losing quality.', ARRAY['videh','documents','files']),
      (9,  'Live location sharing explained', 'Share live location for trips, deliveries, and family safety.', ARRAY['videh','location','safety']),
      (10, 'Chat backup & restore on Videh', 'Protect chats when you change phones — backup best practices.', ARRAY['videh','backup','security']),
      (11, 'Two-step verification setup', 'Add PIN/email lock so only you can register your number.', ARRAY['videh','2fa','security']),
      (12, 'Block & report — stay safe online', 'Block spam, report abuse, and keep your inbox clean.', ARRAY['videh','safety','report']),
      (13, 'Custom notifications per chat', 'Mute groups, set custom tones, and priority alerts.', ARRAY['videh','notifications','settings']),
      (14, 'Dark mode & themes on Videh', 'Reduce eye strain and save battery with dark theme.', ARRAY['videh','darkmode','ui']),
      (15, 'Search messages & media fast', 'Find old photos, links, and starred messages in seconds.', ARRAY['videh','search','productivity']),
      (16, 'Pin important chats to top', 'Keep family, work, and Khata chats always visible.', ARRAY['videh','pin','organize']),
      (17, 'Starred messages — save key info', 'Star OTPs, addresses, and payment details for quick access.', ARRAY['videh','starred','tips']),
      (18, 'Disappearing messages for privacy', 'Auto-delete sensitive chats after 24 hours or 7 days.', ARRAY['videh','privacy','disappearing']),
      (19, 'India digital connect — Videh overview', 'Why Videh is built for Indian users: calls, chat, status, and Video in one app.', ARRAY['videh','india','overview'])
    ) AS t(mod_idx, title_base, desc_base, base_tags)
  ) tp ON tp.mod_idx = (gs.n - 1) % 20;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  UPDATE reels_channels c SET
    total_views = s.sum_views,
    total_view_hours = s.sum_hours,
    total_likes = s.sum_likes,
    total_comments = s.sum_comments,
    total_shares = s.sum_shares,
    updated_at = NOW()
  FROM (
    SELECT
      SUM(view_count) AS sum_views,
      SUM((view_count::numeric * LEAST(duration_seconds, 300)) / 3600.0) AS sum_hours,
      SUM(like_count) AS sum_likes,
      SUM(comment_count) AS sum_comments,
      SUM(share_count) AS sum_shares
    FROM reels_videos
    WHERE channel_id = v_channel_id
  ) s
  WHERE c.id = v_channel_id;

  RAISE NOTICE '044_reels_videh_official_seed: @videh channel id=% — inserted % videos.',
    v_channel_id, v_inserted;
END $$;

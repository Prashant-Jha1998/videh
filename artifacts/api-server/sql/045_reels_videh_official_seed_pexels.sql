-- Re-seed @videh with REAL playable Pexels videos (1–5 min metadata) + matching thumbnails.
-- Run AFTER 044 delete if old fake Google/Mixkit videos exist.
-- Requires: 041, 042, 043. User 9625692122 must exist.

DO $$
DECLARE
  v_user_id INTEGER;
  v_channel_id INTEGER;
  v_inserted INTEGER;
BEGIN
  SELECT u.id INTO v_user_id
  FROM users u
  WHERE regexp_replace(COALESCE(u.phone, ''), '\D', '', 'g') LIKE '%9625692122'
  ORDER BY u.id
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE NOTICE '045_pexels_seed: user 9625692122 not found.';
    RETURN;
  END IF;

  INSERT INTO reels_channels (
    user_id, handle, avatar_url, bio,
    subscriber_count, total_views, total_view_hours,
    total_likes, total_comments, total_shares,
    fraud_score, monetization_status, monetization_eligible
  )
  VALUES (
    v_user_id, 'videh', 'https://videh.co.in/assets/videh-icon.png',
    'Official Videh channel — messenger tips, tutorials, and updates.',
    12840, 0, 0, 0, 0, 0, 0, 'eligible', TRUE
  )
  ON CONFLICT (user_id) DO UPDATE SET
    handle = EXCLUDED.handle,
    updated_at = NOW()
  RETURNING id INTO v_channel_id;

  IF v_channel_id IS NULL THEN
    SELECT id INTO v_channel_id FROM reels_channels WHERE user_id = v_user_id;
  END IF;

  -- Remove any previous seed batch (fake or partial)
  DELETE FROM reels_moderation_log
  WHERE video_id IN (
    SELECT id FROM reels_videos
    WHERE channel_id = v_channel_id AND 'videh_official_seed' = ANY(hashtags)
  );
  DELETE FROM reels_videos
  WHERE channel_id = v_channel_id AND 'videh_official_seed' = ANY(hashtags);

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
    tp.desc_base || E'\n\n#Videh official #' || gs.n::text,
    tp.base_tags || ARRAY['videh_official_seed', 'pexels', ('ep' || gs.n::text)],
    vp.video_url,
    vp.thumb_url,
    vp.duration_sec,
    1500 + ((gs.n * 7919) % 185000),
    60 + ((gs.n * 3571) % 9200),
    (gs.n * 17) % 140,
    12 + ((gs.n * 997) % 480),
    (gs.n * 41) % 1100,
    0, 'published', TRUE, 'approved', NOW(), 0,
    NOW() - ((201 - gs.n) * INTERVAL '9 hours')
  FROM generate_series(1, 200) AS gs(n)
  JOIN (
    SELECT * FROM (VALUES
      (0,  'https://videos.pexels.com/video-files/3571264/3571264-hd_1920_1080_30fps.mp4', 'https://images.pexels.com/videos/3571264/pictures/preview-0.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1280&h=720', 90),
      (1,  'https://videos.pexels.com/video-files/854633/854633-hd_1280_720_30fps.mp4', 'https://images.pexels.com/videos/854633/pictures/preview-0.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1280&h=720', 120),
      (2,  'https://videos.pexels.com/video-files/4769638/4769638-hd_1920_1080_30fps.mp4', 'https://images.pexels.com/videos/4769638/pictures/preview-0.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1280&h=720', 150),
      (3,  'https://videos.pexels.com/video-files/2098989/2098989-hd_1920_1080_30fps.mp4', 'https://images.pexels.com/videos/2098989/pictures/preview-0.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1280&h=720', 180),
      (4,  'https://videos.pexels.com/video-files/2169880/2169880-hd_1920_1080_30fps.mp4', 'https://images.pexels.com/videos/2169880/pictures/preview-0.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1280&h=720', 210),
      (5,  'https://videos.pexels.com/video-files/3130182/3130182-hd_1920_1080_30fps.mp4', 'https://images.pexels.com/videos/3130182/pictures/preview-0.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1280&h=720', 240),
      (6,  'https://videos.pexels.com/video-files/5752729/5752729-hd_1920_1080_30fps.mp4', 'https://images.pexels.com/videos/5752729/pictures/preview-0.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1280&h=720', 270),
      (7,  'https://videos.pexels.com/video-files/856356/856356-sd_960_540_25fps.mp4', 'https://images.pexels.com/videos/856356/pictures/preview-0.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1280&h=720', 300),
      (8,  'https://videos.pexels.com/video-files/856357/856357-hd_1920_1080_30fps.mp4', 'https://images.pexels.com/videos/856357/pictures/preview-0.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1280&h=720', 60),
      (9,  'https://videos.pexels.com/video-files/856359/856359-hd_1920_1080_30fps.mp4', 'https://images.pexels.com/videos/856359/pictures/preview-0.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1280&h=720', 75),
      (10, 'https://videos.pexels.com/video-files/856360/856360-hd_1920_1080_30fps.mp4', 'https://images.pexels.com/videos/856360/pictures/preview-0.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1280&h=720', 90),
      (11, 'https://videos.pexels.com/video-files/856362/856362-hd_1920_1080_30fps.mp4', 'https://images.pexels.com/videos/856362/pictures/preview-0.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1280&h=720', 105),
      (12, 'https://videos.pexels.com/video-files/856364/856364-hd_1920_1080_30fps.mp4', 'https://images.pexels.com/videos/856364/pictures/preview-0.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1280&h=720', 120),
      (13, 'https://videos.pexels.com/video-files/856365/856365-hd_1920_1080_30fps.mp4', 'https://images.pexels.com/videos/856365/pictures/preview-0.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1280&h=720', 135),
      (14, 'https://videos.pexels.com/video-files/856372/856372-hd_1920_1080_30fps.mp4', 'https://images.pexels.com/videos/856372/pictures/preview-0.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1280&h=720', 150),
      (15, 'https://videos.pexels.com/video-files/856374/856374-hd_1920_1080_30fps.mp4', 'https://images.pexels.com/videos/856374/pictures/preview-0.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1280&h=720', 165),
      (16, 'https://videos.pexels.com/video-files/856376/856376-hd_1920_1080_30fps.mp4', 'https://images.pexels.com/videos/856376/pictures/preview-0.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1280&h=720', 180),
      (17, 'https://videos.pexels.com/video-files/856380/856380-hd_1920_1080_30fps.mp4', 'https://images.pexels.com/videos/856380/pictures/preview-0.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1280&h=720', 195),
      (18, 'https://videos.pexels.com/video-files/856381/856381-hd_1920_1080_30fps.mp4', 'https://images.pexels.com/videos/856381/pictures/preview-0.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1280&h=720', 210),
      (19, 'https://videos.pexels.com/video-files/856382/856382-hd_1920_1080_30fps.mp4', 'https://images.pexels.com/videos/856382/pictures/preview-0.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1280&h=720', 225)
    ) AS t(mod_idx, video_url, thumb_url, duration_sec)
  ) vp ON vp.mod_idx = (gs.n - 1) % 20
  JOIN (
    SELECT * FROM (VALUES
      (0,  'Videh Messenger — privacy settings guide', 'Set last seen, profile photo, and about privacy on Videh.', ARRAY['videh','privacy','messenger']),
      (1,  'Videh par group chat kaise banayein', 'Create groups, add members, and manage notifications.', ARRAY['videh','group','hindi']),
      (2,  'Voice calls on Videh — clear audio tips', 'Start voice calls and fix common audio issues.', ARRAY['videh','voice','calls']),
      (3,  'Video calling — HD quality guide', 'Lighting, Wi‑Fi, and permissions for smooth calls.', ARRAY['videh','video','hd']),
      (4,  'Status updates — photos & videos', 'Post 24-hour status and control viewers.', ARRAY['videh','status']),
      (5,  'Khata ledger — udhar & jama', 'Track daily business entries on Videh Khata.', ARRAY['videh','khata','hindi']),
      (6,  'Hey Videh assistant commands', 'Hands-free messaging with voice assistant.', ARRAY['videh','assistant','ai']),
      (7,  'Broadcast lists explained', 'Message many contacts safely at once.', ARRAY['videh','broadcast']),
      (8,  'Share documents in chat', 'Send PDFs and files without quality loss.', ARRAY['videh','documents']),
      (9,  'Live location sharing', 'Share trip location with family and friends.', ARRAY['videh','location']),
      (10, 'Chat backup & restore', 'Keep chats safe when changing phones.', ARRAY['videh','backup']),
      (11, 'Two-step verification', 'Protect your account with extra lock.', ARRAY['videh','security']),
      (12, 'Block & report spam', 'Stay safe from unwanted messages.', ARRAY['videh','safety']),
      (13, 'Custom chat notifications', 'Mute groups and set custom tones.', ARRAY['videh','notifications']),
      (14, 'Dark mode on Videh', 'Comfortable viewing day and night.', ARRAY['videh','darkmode']),
      (15, 'Search messages & media', 'Find photos, links, and starred items fast.', ARRAY['videh','search']),
      (16, 'Pin important chats', 'Keep key chats at the top.', ARRAY['videh','pin']),
      (17, 'Starred messages tips', 'Save OTPs and addresses quickly.', ARRAY['videh','starred']),
      (18, 'Disappearing messages', 'Auto-delete sensitive chats.', ARRAY['videh','privacy']),
      (19, 'Videh India — full overview', 'Chat, calls, status, Khata, and Video in one app.', ARRAY['videh','india'])
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
    FROM reels_videos WHERE channel_id = v_channel_id
  ) s
  WHERE c.id = v_channel_id;

  RAISE NOTICE '045_pexels_seed: inserted % playable Pexels videos for @videh.', v_inserted;
END $$;

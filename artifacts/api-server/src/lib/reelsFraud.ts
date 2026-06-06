import { query } from "./db";
import { getReelsPlatformConfig, type ReelsPlatformConfig } from "./reelsConfig";
import { ensureReelsAdminColumns } from "./reelsSchema";

async function logFraudEvent(
  entityType: "channel" | "video",
  entityId: number,
  signalType: string,
  scoreDelta: number,
  details?: Record<string, unknown>,
): Promise<void> {
  await query(
    `INSERT INTO reels_fraud_events (entity_type, entity_id, signal_type, score_delta, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [entityType, entityId, signalType, scoreDelta, details ? JSON.stringify(details) : null],
  );
  const table = entityType === "channel" ? "reels_channels" : "reels_videos";
  await query(
    `UPDATE ${table} SET fraud_score = LEAST(100, fraud_score + $1) WHERE id = $2`,
    [scoreDelta, entityId],
  );
}

export async function checkViewFraud(
  videoId: number,
  channelId: number,
  userId: number | null,
  watchedSeconds: number,
  config?: ReelsPlatformConfig,
): Promise<{ counted: boolean; reason?: string }> {
  const cfg = config ?? await getReelsPlatformConfig();
  if (!cfg.fraud.enabled) return { counted: true };

  if (watchedSeconds < cfg.fraud.minWatchSecondsForValidView) {
    return { counted: false, reason: "watch_too_short" };
  }

  if (userId) {
    const recent = await query(
      `SELECT COUNT(*)::int AS c FROM reels_view_sessions
       WHERE video_id = $1 AND user_id = $2 AND created_at > NOW() - INTERVAL '1 hour' AND counted_as_view = TRUE`,
      [videoId, userId],
    );
    if (Number(recent.rows[0]?.c) >= cfg.fraud.maxViewsPerUserPerVideoPerHour) {
      await logFraudEvent("video", videoId, "duplicate_view_burst", 2, { userId });
      return { counted: false, reason: "duplicate_view" };
    }
  }

  const rapid = await query(
    `SELECT COUNT(*)::int AS c FROM reels_view_sessions
     WHERE video_id = $1 AND created_at > NOW() - INTERVAL '1 minute'`,
    [videoId],
  );
  if (Number(rapid.rows[0]?.c) >= cfg.fraud.rapidViewsPerMinuteThreshold) {
    await logFraudEvent("video", videoId, "rapid_view_spike", 5, { perMinute: rapid.rows[0]?.c });
    await logFraudEvent("channel", channelId, "rapid_view_spike", 3, { videoId });
    return { counted: false, reason: "rapid_views" };
  }

  return { counted: true };
}

export async function recordViewSession(
  videoId: number,
  userId: number | null,
  watchedSeconds: number,
  counted: boolean,
): Promise<void> {
  await ensureReelsAdminColumns();
  await query(
    `INSERT INTO reels_view_sessions (video_id, user_id, watched_seconds, counted_as_view)
     VALUES ($1, $2, $3, $4)`,
    [videoId, userId, watchedSeconds, counted],
  );
}

export async function checkCommentFraud(
  videoId: number,
  channelId: number,
  userId: number,
  content: string,
  config?: ReelsPlatformConfig,
): Promise<{ allowed: boolean; reason?: string }> {
  const cfg = config ?? await getReelsPlatformConfig();
  if (!cfg.fraud.enabled) return { allowed: true };

  const dup = await query(
    `SELECT 1 FROM reels_video_comments c
     WHERE c.video_id = $1 AND c.user_id = $2 AND LOWER(TRIM(c.content)) = LOWER(TRIM($3))
       AND c.created_at > NOW() - ($4::text || ' minutes')::interval
     LIMIT 1`,
    [videoId, userId, content, cfg.fraud.duplicateCommentWindowMinutes],
  );
  if (dup.rows.length > 0) {
    await logFraudEvent("video", videoId, "duplicate_comment", 3, { userId });
    return { allowed: false, reason: "duplicate_comment" };
  }

  const burst = await query(
    `SELECT COUNT(*)::int AS c FROM reels_video_comments
     WHERE video_id = $1 AND user_id = $2 AND created_at > NOW() - INTERVAL '10 minutes'`,
    [videoId, userId],
  );
  if (Number(burst.rows[0]?.c) >= 8) {
    await logFraudEvent("channel", channelId, "comment_burst", 4, { userId, videoId });
    return { allowed: false, reason: "comment_burst" };
  }

  return { allowed: true };
}

export async function checkSubscribeFraud(
  channelId: number,
  userId: number,
  config?: ReelsPlatformConfig,
): Promise<{ allowed: boolean; reason?: string }> {
  const cfg = config ?? await getReelsPlatformConfig();
  if (!cfg.fraud.enabled) return { allowed: true };

  const hourly = await query(
    `SELECT COUNT(*)::int AS c FROM reels_subscriptions
     WHERE subscriber_user_id = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
    [userId],
  );
  if (Number(hourly.rows[0]?.c) >= cfg.fraud.maxSubscribesPerUserPerHour) {
    await logFraudEvent("channel", channelId, "subscribe_burst_user", 5, { userId });
    return { allowed: false, reason: "subscribe_burst" };
  }

  const spike = await query(
    `SELECT COUNT(*)::int AS c FROM reels_subscriptions
     WHERE channel_id = $1 AND created_at > NOW() - ($2::text || ' minutes')::interval`,
    [channelId, cfg.fraud.subscriberSpikeWindowMinutes],
  );
  if (Number(spike.rows[0]?.c) >= cfg.fraud.subscriberSpikeThreshold) {
    await logFraudEvent("channel", channelId, "subscriber_spike", 8, { count: spike.rows[0]?.c });
    return { allowed: false, reason: "subscriber_spike" };
  }

  return { allowed: true };
}

export async function runChannelFraudRescan(channelId: number): Promise<number> {
  await ensureReelsAdminColumns();
  const ch = await query(
    `SELECT c.*,
      (SELECT COUNT(*)::int FROM reels_videos v WHERE v.channel_id = c.id AND v.fraud_score > 30) AS bad_videos,
      (SELECT COUNT(*)::int FROM reels_fraud_events e WHERE e.entity_type = 'channel' AND e.entity_id = c.id
         AND e.created_at > NOW() - INTERVAL '7 days') AS recent_signals
     FROM reels_channels c WHERE c.id = $1`,
    [channelId],
  );
  if (!ch.rows.length) return 0;
  const row = ch.rows[0];
  let score = Number(row.fraud_score ?? 0);
  const views = Number(row.total_views ?? 0);
  const likes = Number(row.total_likes ?? 0);
  const comments = Number(row.total_comments ?? 0);
  if (views > 1000 && likes + comments < views * 0.001) {
    score = Math.min(100, score + 10);
    await logFraudEvent("channel", channelId, "engagement_anomaly", 10, { views, likes, comments });
  }
  if (Number(row.bad_videos) > 2) {
    score = Math.min(100, score + Number(row.bad_videos) * 2);
  }
  await query(`UPDATE reels_channels SET fraud_score = $1 WHERE id = $2`, [score, channelId]);
  return score;
}

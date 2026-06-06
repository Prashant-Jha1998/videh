import { query } from "./db";
import { getReelsPlatformConfig, type ReelsPlatformConfig } from "./reelsConfig";

export type MonetizationCheck = {
  eligible: boolean;
  status: "not_eligible" | "eligible" | "review" | "suspended";
  reasons: string[];
  revenueSharePercent: number;
};

export async function evaluateChannelMonetization(
  channelId: number,
  config?: ReelsPlatformConfig,
): Promise<MonetizationCheck> {
  const cfg = config ?? await getReelsPlatformConfig();
  const m = cfg.monetization;

  const r = await query(
    `SELECT c.*,
      (SELECT COUNT(*)::int FROM reels_videos v
       WHERE v.channel_id = c.id AND v.status = 'published') AS public_videos
     FROM reels_channels c WHERE c.id = $1`,
    [channelId],
  );
  if (!r.rows.length) {
    return { eligible: false, status: "not_eligible", reasons: ["Channel not found"], revenueSharePercent: m.revenueSharePercent };
  }
  const ch = r.rows[0];
  const reasons: string[] = [];
  const subs = Number(ch.subscriber_count ?? 0);
  const hours = Number(ch.total_view_hours ?? 0);
  const videos = Number(ch.public_videos ?? 0);
  const fraud = Number(ch.fraud_score ?? 0);

  if (subs < m.minSubscribers) reasons.push(`Need ${m.minSubscribers} subscribers (you have ${subs})`);
  if (hours < m.minWatchHours) reasons.push(`Need ${m.minWatchHours} watch hours (you have ${hours.toFixed(1)})`);
  if (videos < m.minPublicVideos) reasons.push(`Need ${m.minPublicVideos} public videos (you have ${videos})`);
  if (fraud > m.maxFraudScore) reasons.push(`Fraud score too high (${fraud.toFixed(1)} / max ${m.maxFraudScore})`);

  const eligible = reasons.length === 0;
  const status = eligible ? "eligible" : (ch.monetization_status === "suspended" ? "suspended" : "not_eligible");

  if (eligible) {
    await query(
      `UPDATE reels_channels SET monetization_eligible = TRUE, monetization_status = 'eligible' WHERE id = $1`,
      [channelId],
    );
  } else {
    await query(
      `UPDATE reels_channels SET monetization_eligible = FALSE, monetization_status = 'not_eligible' WHERE id = $1`,
      [channelId],
    );
  }

  return { eligible, status, reasons, revenueSharePercent: m.revenueSharePercent };
}

export function canPlayVideo(
  video: { status?: string; play_enabled?: boolean; fraud_score?: number },
  config: ReelsPlatformConfig,
): { allowed: boolean; reasons: string[] } {
  const p = config.playButton;
  const reasons: string[] = [];
  if (p.requirePublishedStatus && video.status !== "published") {
    reasons.push("Video is not published");
  }
  if (video.play_enabled === false) {
    reasons.push("Playback disabled by moderation");
  }
  if (p.blockHighFraudVideos && Number(video.fraud_score ?? 0) > p.maxFraudScoreForPlay) {
    reasons.push("High fraud score — playback restricted");
  }
  return { allowed: reasons.length === 0, reasons };
}

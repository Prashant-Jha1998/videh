import { query } from "./db";
import { ensureReelsTables } from "./reelsSchema";

export type ReelsMonetizationRules = {
  minSubscribers: number;
  minWatchHours: number;
  minPublicVideos: number;
  maxFraudScore: number;
  revenueSharePercent: number;
  requireGoodStanding: boolean;
  summary: string[];
};

export type ReelsPlayButtonRules = {
  minWatchSecondsToCountView: number;
  requirePublishedStatus: boolean;
  blockHighFraudVideos: boolean;
  maxFraudScoreForPlay: number;
  summary: string[];
};

export type ReelsFraudRules = {
  enabled: boolean;
  maxViewsPerUserPerVideoPerHour: number;
  maxSubscribesPerUserPerHour: number;
  minWatchSecondsForValidView: number;
  rapidViewsPerMinuteThreshold: number;
  duplicateCommentWindowMinutes: number;
  subscriberSpikeThreshold: number;
  subscriberSpikeWindowMinutes: number;
};

export type ReelsFeedRules = {
  subscribedChannelBoost: number;
  recencyBoostHours: number;
  weightLikes: number;
  weightComments: number;
  weightWatchHours: number;
  fraudPenaltyMultiplier: number;
  summary: string[];
};

export type ReelsNotificationRules = {
  notifySubscribersOnNewVideo: boolean;
  subscribersNotifiedFirst: boolean;
};

export type ReelsContentModerationRules = {
  enabled: boolean;
  nsfwBlockThreshold: number;
  requireThumbnail: boolean;
  blockWithoutVisionApi: boolean;
  syncVideoScanMaxSeconds: number;
  summary: string[];
};

export type ReelsPrivacyRules = {
  hidePhoneOnVideoPlatform: boolean;
  videoIdentityIsHandleOnly: boolean;
  summary: string[];
};

export type ReelsPlatformConfig = {
  monetization: ReelsMonetizationRules;
  playButton: ReelsPlayButtonRules;
  fraud: ReelsFraudRules;
  feed: ReelsFeedRules;
  notifications: ReelsNotificationRules;
  contentModeration: ReelsContentModerationRules;
  privacy: ReelsPrivacyRules;
};

export const DEFAULT_REELS_PLATFORM_CONFIG: ReelsPlatformConfig = {
  monetization: {
    minSubscribers: 1000,
    minWatchHours: 4000,
    minPublicVideos: 5,
    maxFraudScore: 25,
    revenueSharePercent: 35,
    requireGoodStanding: true,
    summary: [
      "At least 1,000 subscribers on your channel",
      "At least 4,000 valid watch hours in the last 12 months",
      "At least 5 public videos on your channel",
      "Channel in good standing (low fraud score, no policy strikes)",
      "YouTube Partner Program–style review may apply before ads run",
    ],
  },
  playButton: {
    minWatchSecondsToCountView: 30,
    requirePublishedStatus: true,
    blockHighFraudVideos: true,
    maxFraudScoreForPlay: 40,
    summary: [
      "Play is available when the video is published and not removed",
      "Views count only after the viewer watches at least 30 seconds",
      "Videos with very high fraud scores may be blocked from playback",
      "Monetized playback follows the same eligibility rules as the Partner Program",
    ],
  },
  fraud: {
    enabled: true,
    maxViewsPerUserPerVideoPerHour: 5,
    maxSubscribesPerUserPerHour: 20,
    minWatchSecondsForValidView: 10,
    rapidViewsPerMinuteThreshold: 30,
    duplicateCommentWindowMinutes: 60,
    subscriberSpikeThreshold: 50,
    subscriberSpikeWindowMinutes: 60,
  },
  feed: {
    subscribedChannelBoost: 100,
    recencyBoostHours: 48,
    weightLikes: 3,
    weightComments: 5,
    weightWatchHours: 10,
    fraudPenaltyMultiplier: 0.3,
    summary: [
      "New videos from channels you subscribe to appear first",
      "Recent uploads within 48 hours get a freshness boost",
      "Engagement (likes, comments, watch time) improves ranking",
      "Suspected fake engagement reduces visibility",
    ],
  },
  notifications: {
    notifySubscribersOnNewVideo: true,
    subscribersNotifiedFirst: true,
  },
  contentModeration: {
    enabled: true,
    nsfwBlockThreshold: 0.55,
    requireThumbnail: true,
    blockWithoutVisionApi: true,
    syncVideoScanMaxSeconds: 60,
    summary: [
      "Every video is automatically scanned for nudity and sexual content before it goes public",
      "Thumbnails and video frames are checked with AI vision",
      "Sexual, nude, or adult content is blocked and cannot be published",
      "Longer videos may take a few minutes to review — you will be notified when live",
      "Repeated policy violations may suspend your channel",
    ],
  },
  privacy: {
    hidePhoneOnVideoPlatform: true,
    videoIdentityIsHandleOnly: true,
    summary: [
      "Your mobile number is never shown on Video — only your @username appears",
      "Video viewers see @handles only, not messenger names or phone numbers",
      "Phone numbers in comments or descriptions are automatically hidden on Video",
      "Messenger phone visibility follows your normal Videh privacy settings — separate from Video",
    ],
  },
};

let configEnsured = false;

async function ensureConfigTable(): Promise<void> {
  if (configEnsured) return;
  await ensureReelsTables();
  await query(`
    CREATE TABLE IF NOT EXISTS reels_platform_config (
      id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      config JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by TEXT
    )
  `);
  await query(`INSERT INTO reels_platform_config (id, config) VALUES (1, '{}'::jsonb) ON CONFLICT DO NOTHING`);
  configEnsured = true;
}

function deepMergeConfig(partial: Partial<ReelsPlatformConfig>): ReelsPlatformConfig {
  const base = DEFAULT_REELS_PLATFORM_CONFIG;
  return {
    monetization: { ...base.monetization, ...partial.monetization },
    playButton: { ...base.playButton, ...partial.playButton },
    fraud: { ...base.fraud, ...partial.fraud },
    feed: { ...base.feed, ...partial.feed },
    notifications: { ...base.notifications, ...partial.notifications },
    contentModeration: { ...base.contentModeration, ...partial.contentModeration },
    privacy: { ...base.privacy, ...partial.privacy },
  };
}

export async function getReelsPlatformConfig(): Promise<ReelsPlatformConfig> {
  await ensureConfigTable();
  const r = await query(`SELECT config FROM reels_platform_config WHERE id = 1`);
  const stored = r.rows[0]?.config as Partial<ReelsPlatformConfig> | null;
  return deepMergeConfig(stored && typeof stored === "object" ? stored : {});
}

export async function saveReelsPlatformConfig(
  partial: Partial<ReelsPlatformConfig>,
  updatedBy?: string,
): Promise<ReelsPlatformConfig> {
  const current = await getReelsPlatformConfig();
  const next = deepMergeConfig({ ...current, ...partial });
  await query(
    `UPDATE reels_platform_config SET config = $1::jsonb, updated_at = NOW(), updated_by = $2 WHERE id = 1`,
    [JSON.stringify(next), updatedBy ?? null],
  );
  return next;
}

/** Public rules shown on creator profile (no internal thresholds). */
export function publicReelsRules(config: ReelsPlatformConfig) {
  return {
    monetization: {
      rules: config.monetization.summary,
      revenueSharePercent: config.monetization.revenueSharePercent,
    },
    playButton: { rules: config.playButton.summary },
    feed: { rules: config.feed.summary },
    contentModeration: { rules: config.contentModeration.summary },
    privacy: { rules: config.privacy.summary },
  };
}

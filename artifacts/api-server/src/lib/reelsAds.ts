import crypto from "node:crypto";
import { query } from "./db";
import { getReelsPlatformConfig, type ReelsAdsRules } from "./reelsConfig";
import { ensureReelsAdsTables } from "./reelsAdsSchema";

export type ReelsAdBreakItem = {
  id: number;
  title: string;
  videoUrl: string;
  durationSeconds: number;
  skipAfterSeconds: number | null;
  adType: "non_skippable" | "skippable";
  placement: "pre_roll" | "mid_roll";
  advertiserName: string;
};

export type ReelsMidRollBreak = {
  offsetSeconds: number;
  ad: ReelsAdBreakItem;
};

export type ReelsAdBreaksResponse = {
  enabled: boolean;
  preRoll: ReelsAdBreakItem[];
  midRoll: ReelsMidRollBreak[];
};

type CreativeRow = {
  id: number;
  title: string;
  video_url: string;
  duration_seconds: number;
  skip_after_seconds: number | null;
  placement: string;
  ad_type: string;
  company_name?: string;
};

function resolveAdVideoUrl(stored: string): string {
  if (/^https?:\/\//i.test(stored)) return stored;
  const domain = process.env.EXPO_PUBLIC_DOMAIN || process.env.PUBLIC_API_DOMAIN || "videh.co.in";
  const base = /^https?:\/\//i.test(domain) ? domain.replace(/\/+$/, "") : `https://${domain}`;
  const path = stored.startsWith("/") ? stored : `/uploads/${stored.replace(/^uploads\//, "")}`;
  return `${base}${path}`;
}

function mapCreative(row: CreativeRow, placement: "pre_roll" | "mid_roll"): ReelsAdBreakItem {
  const stored = String(row.video_url ?? "");
  const videoUrl = resolveAdVideoUrl(stored);
  return {
    id: Number(row.id),
    title: row.title,
    videoUrl,
    durationSeconds: Number(row.duration_seconds) || 30,
    skipAfterSeconds: row.skip_after_seconds != null ? Number(row.skip_after_seconds) : null,
    adType: row.ad_type === "skippable" ? "skippable" : "non_skippable",
    placement,
    advertiserName: row.company_name ?? "Advertiser",
  };
}

async function pickCreative(
  placement: "pre_roll" | "mid_roll",
  adType?: "non_skippable" | "skippable",
): Promise<CreativeRow | null> {
  const typeClause = adType ? `AND cr.ad_type = $2` : "";
  const params: unknown[] = [placement];
  if (adType) params.push(adType);
  const r = await query(
    `SELECT cr.id, cr.title, cr.video_url, cr.duration_seconds, cr.skip_after_seconds,
            cr.placement, cr.ad_type, adv.company_name
     FROM reels_ad_creatives cr
     JOIN reels_ad_campaigns camp ON camp.id = cr.campaign_id
     JOIN reels_advertisers adv ON adv.id = camp.advertiser_id
     WHERE cr.is_active = TRUE
       AND camp.status = 'active'
       AND adv.status = 'active'
       AND (cr.placement = $1 OR cr.placement = 'any')
       ${typeClause}
     ORDER BY RANDOM()
     LIMIT 1`,
    params,
  );
  return (r.rows[0] as CreativeRow | undefined) ?? null;
}

function fallbackPreRoll(ads: ReelsAdsRules): ReelsAdBreakItem[] {
  return [
    {
      id: 0,
      title: "Sponsored",
      videoUrl: ads.fallbackNonSkipUrl,
      durationSeconds: ads.preRollNonSkipSeconds,
      skipAfterSeconds: null,
      adType: "non_skippable",
      placement: "pre_roll",
      advertiserName: "Videh",
    },
    {
      id: -1,
      title: "Sponsored",
      videoUrl: ads.fallbackSkippableUrl,
      durationSeconds: ads.preRollSkippableSeconds,
      skipAfterSeconds: ads.preRollSkipAfterSeconds,
      adType: "skippable",
      placement: "pre_roll",
      advertiserName: "Videh",
    },
  ];
}

function buildMidRollOffsets(contentDurationSeconds: number, intervalSeconds: number, minContentSeconds: number): number[] {
  if (contentDurationSeconds < minContentSeconds) return [];
  const offsets: number[] = [];
  let at = intervalSeconds;
  while (at < contentDurationSeconds - 60) {
    offsets.push(at);
    at += intervalSeconds;
  }
  return offsets;
}

export async function resolveReelsAdBreaks(opts: {
  contentVideoId: number;
  contentDurationSeconds: number;
  viewerUserId: number;
  channelOwnerUserId: number | null;
}): Promise<ReelsAdBreaksResponse> {
  await ensureReelsAdsTables();
  const cfg = await getReelsPlatformConfig();
  const ads = cfg.ads;

  if (!ads.enabled) {
    return { enabled: false, preRoll: [], midRoll: [] };
  }
  if (opts.channelOwnerUserId && opts.viewerUserId === opts.channelOwnerUserId) {
    return { enabled: false, preRoll: [], midRoll: [] };
  }

  const preRoll: ReelsAdBreakItem[] = [];

  const nonSkip = await pickCreative("pre_roll", "non_skippable");
  if (nonSkip) {
    preRoll.push(mapCreative(
      { ...nonSkip, duration_seconds: nonSkip.duration_seconds || ads.preRollNonSkipSeconds },
      "pre_roll",
    ));
  } else {
    preRoll.push(fallbackPreRoll(ads)[0]);
  }

  const skippable = await pickCreative("pre_roll", "skippable");
  if (skippable) {
    preRoll.push(mapCreative(skippable, "pre_roll"));
  } else {
    preRoll.push(fallbackPreRoll(ads)[1]);
  }

  const midRoll: ReelsMidRollBreak[] = [];
  const offsets = buildMidRollOffsets(
    opts.contentDurationSeconds,
    ads.midRollIntervalSeconds,
    ads.midRollMinContentSeconds,
  );
  for (const offsetSeconds of offsets) {
    const mid = await pickCreative("mid_roll", "non_skippable");
    const ad = mid
      ? mapCreative(mid, "mid_roll")
      : {
        id: -2,
        title: "Sponsored",
        videoUrl: ads.fallbackMidRollUrl,
        durationSeconds: ads.midRollSeconds,
        skipAfterSeconds: null,
        adType: "non_skippable" as const,
        placement: "mid_roll" as const,
        advertiserName: "Videh",
      };
    midRoll.push({ offsetSeconds, ad });
  }

  return { enabled: true, preRoll, midRoll };
}

export async function recordReelsAdImpression(opts: {
  creativeId: number;
  contentVideoId: number;
  viewerUserId: number;
  placement: string;
  watchedSeconds: number;
  skipped: boolean;
  completed: boolean;
}): Promise<void> {
  await ensureReelsAdsTables();
  if (opts.creativeId <= 0) return;
  await query(
    `INSERT INTO reels_ad_impressions
      (creative_id, content_video_id, viewer_user_id, placement, watched_seconds, skipped, completed)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      opts.creativeId,
      opts.contentVideoId,
      opts.viewerUserId || null,
      opts.placement,
      opts.watchedSeconds,
      opts.skipped,
      opts.completed,
    ],
  );
  if (opts.skipped) {
    await query(`UPDATE reels_ad_creatives SET impressions = impressions + 1, skips = skips + 1 WHERE id = $1`, [opts.creativeId]);
  } else if (opts.completed) {
    await query(`UPDATE reels_ad_creatives SET impressions = impressions + 1, completions = completions + 1 WHERE id = $1`, [opts.creativeId]);
  } else {
    await query(`UPDATE reels_ad_creatives SET impressions = impressions + 1 WHERE id = $1`, [opts.creativeId]);
  }
}

export function hashAdsPassword(password: string): string {
  return crypto.createHash("sha256").update(`videh-ads:${password}`).digest("hex");
}

export async function verifyAdsAdvertiser(email: string, password: string) {
  await ensureReelsAdsTables();
  const r = await query(
    `SELECT id, email, company_name, password_hash, status, balance_inr
     FROM reels_advertisers WHERE LOWER(email) = LOWER($1) LIMIT 1`,
    [email.trim()],
  );
  const row = r.rows[0] as {
    id: number;
    email: string;
    company_name: string;
    password_hash: string;
    status: string;
    balance_inr: string;
  } | undefined;
  if (!row || row.status !== "active") return null;
  if (row.password_hash === "managed_by_admin") return null;
  const hash = hashAdsPassword(password);
  if (hash !== row.password_hash) return null;
  return row;
}

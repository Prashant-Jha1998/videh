import crypto from "node:crypto";
import { query } from "./db";
import { defaultUploadsRootDir, resolveStoredMediaUrlEnv } from "./mediaStorage";
import { getReelsPlatformConfig, type ReelsAdsRules } from "./reelsConfig";
import { ensureReelsAdsTables } from "./reelsAdsSchema";

export type ReelsAdFormat = "video" | "image" | "app_install" | "shopping" | "bumper" | "shorts_video" | "carousel" | "lead_form";
export type ReelsAdCta = "shop_now" | "install" | "learn_more" | "watch_now" | "play_store" | "app_store";
export type ReelsAdObjective = "brand_awareness" | "video_views" | "app_promotion" | "shopping";
export type ReelsAdBidModel = "cpm" | "cpc" | "cpv" | "cpi";

export type ReelsFeedAdItem = {
  id: number;
  format: ReelsAdFormat;
  title: string;
  headline: string;
  description: string;
  imageUrl: string | null;
  videoUrl: string | null;
  ctaType: ReelsAdCta;
  destinationUrl: string | null;
  playStoreUrl: string | null;
  appStoreUrl: string | null;
  appName: string | null;
  advertiserName: string;
  sponsoredLabel: string;
};

export type ReelsAdBreakItem = {
  id: number;
  title: string;
  videoUrl: string;
  durationSeconds: number;
  skipAfterSeconds: number | null;
  adType: "non_skippable" | "skippable";
  placement: "pre_roll" | "mid_roll";
  advertiserName: string;
  format: ReelsAdFormat;
  headline: string;
  description: string;
  imageUrl: string | null;
  ctaType: ReelsAdCta;
  destinationUrl: string | null;
  playStoreUrl: string | null;
  appStoreUrl: string | null;
  appName: string | null;
  appDeveloper: string | null;
  appRating: number | null;
  appReviewCount: string | null;
  appDownloadCount: string | null;
  appCategory: string | null;
  appPriceLabel: string;
  promoImageUrl: string | null;
  promoImageUrl2: string | null;
  sponsoredLabel: string;
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
  video_url: string | null;
  duration_seconds: number;
  skip_after_seconds: number | null;
  placement: string;
  ad_type: string;
  format?: string;
  image_url?: string | null;
  headline?: string | null;
  description?: string | null;
  cta_type?: string | null;
  destination_url?: string | null;
  play_store_url?: string | null;
  app_store_url?: string | null;
  app_name?: string | null;
  app_developer?: string | null;
  app_rating?: string | null;
  app_review_count?: string | null;
  app_download_count?: string | null;
  app_category?: string | null;
  app_price_label?: string | null;
  promo_image_url?: string | null;
  promo_image_url_2?: string | null;
  sponsored_label?: string | null;
  company_name?: string;
  campaign_id?: number;
  bid_model?: string;
  bid_amount_inr?: string;
  balance_inr?: string;
};

function resolveAdAssetUrl(stored: string | null | undefined): string | null {
  if (!stored?.trim()) return null;
  return resolveStoredMediaUrlEnv(stored, defaultUploadsRootDir());
}

function resolveAdVideoUrl(stored: string): string {
  return resolveStoredMediaUrlEnv(stored, defaultUploadsRootDir()) ?? stored;
}

function mapFeedAd(row: CreativeRow): ReelsFeedAdItem {
  const format = (row.format ?? "image") as ReelsAdFormat;
  const cta = (row.cta_type ?? "learn_more") as ReelsAdCta;
  return {
    id: Number(row.id),
    format,
    title: row.title,
    headline: row.headline ?? row.title,
    description: row.description ?? "",
    imageUrl: resolveAdAssetUrl(row.image_url),
    videoUrl: row.video_url ? resolveAdVideoUrl(row.video_url) : null,
    ctaType: cta,
    destinationUrl: row.destination_url ?? null,
    playStoreUrl: row.play_store_url ?? null,
    appStoreUrl: row.app_store_url ?? null,
    appName: row.app_name ?? null,
    advertiserName: row.company_name ?? "Advertiser",
    sponsoredLabel: "Sponsored",
  };
}

function mapCreativeDetails(row: CreativeRow) {
  const format = (row.format ?? "video") as ReelsAdFormat;
  const cta = (row.cta_type ?? "learn_more") as ReelsAdCta;
  const ratingRaw = row.app_rating != null ? Number(row.app_rating) : null;
  return {
    format,
    headline: row.headline ?? row.title,
    description: row.description ?? "",
    imageUrl: resolveAdAssetUrl(row.image_url),
    ctaType: cta,
    destinationUrl: row.destination_url ?? null,
    playStoreUrl: row.play_store_url ?? null,
    appStoreUrl: row.app_store_url ?? null,
    appName: row.app_name ?? null,
    appDeveloper: row.app_developer ?? row.company_name ?? null,
    appRating: ratingRaw != null && Number.isFinite(ratingRaw) ? ratingRaw : null,
    appReviewCount: row.app_review_count ?? null,
    appDownloadCount: row.app_download_count ?? null,
    appCategory: row.app_category ?? null,
    appPriceLabel: row.app_price_label ?? "FREE",
    promoImageUrl: resolveAdAssetUrl(row.promo_image_url),
    promoImageUrl2: resolveAdAssetUrl(row.promo_image_url_2),
    sponsoredLabel: row.sponsored_label ?? "Sponsored",
  };
}

function mapCreative(row: CreativeRow, placement: "pre_roll" | "mid_roll"): ReelsAdBreakItem {
  const details = mapCreativeDetails(row);
  const stored = String(row.video_url ?? "");
  const videoUrl = stored ? resolveAdVideoUrl(stored) : "";
  return {
    id: Number(row.id),
    title: row.title,
    videoUrl,
    durationSeconds: Number(row.duration_seconds) || 30,
    skipAfterSeconds: row.skip_after_seconds != null ? Number(row.skip_after_seconds) : null,
    adType: row.ad_type === "skippable" ? "skippable" : "non_skippable",
    placement,
    advertiserName: row.company_name ?? "Advertiser",
    ...details,
  };
}

async function pickCreative(
  placement: "pre_roll" | "mid_roll" | "feed_instream" | "shorts_feed",
  adType?: "non_skippable" | "skippable" | "bumper",
  format?: ReelsAdFormat,
): Promise<CreativeRow | null> {
  const clauses: string[] = [];
  const params: unknown[] = [placement];
  let idx = 2;
  if (adType) {
    clauses.push(`AND cr.ad_type = $${idx}`);
    params.push(adType);
    idx++;
  }
  if (format) {
    clauses.push(`AND cr.format = $${idx}`);
    params.push(format);
    idx++;
  }
  const r = await query(
    `SELECT cr.id, cr.title, cr.video_url, cr.duration_seconds, cr.skip_after_seconds,
            cr.placement, cr.ad_type, cr.format, cr.image_url, cr.headline, cr.description,
            cr.cta_type, cr.destination_url, cr.play_store_url, cr.app_store_url, cr.app_name,
            cr.app_developer, cr.app_rating, cr.app_review_count, cr.app_download_count,
            cr.app_category, cr.app_price_label, cr.promo_image_url, cr.promo_image_url_2,
            cr.sponsored_label,
            adv.company_name, camp.id AS campaign_id, camp.bid_model, camp.bid_amount_inr, adv.balance_inr
     FROM reels_ad_creatives cr
     JOIN reels_ad_campaigns camp ON camp.id = cr.campaign_id
     JOIN reels_advertisers adv ON adv.id = camp.advertiser_id
     WHERE cr.is_active = TRUE
       AND cr.moderation_status = 'approved'
       AND camp.status = 'active'
       AND adv.status = 'active'
       AND adv.balance_inr > 0
       AND camp.spent_inr < camp.total_budget_inr
       AND camp.start_date <= CURRENT_DATE
       AND (camp.end_date IS NULL OR camp.end_date >= CURRENT_DATE)
       AND (cr.placement = $1 OR cr.placement = 'any')
       ${clauses.join(" ")}
     ORDER BY RANDOM()
     LIMIT 1`,
    params,
  );
  return (r.rows[0] as CreativeRow | undefined) ?? null;
}

export type ReelsFeedAdPlacement = {
  insertAfterIndex: number;
  ad: ReelsFeedAdItem;
};

export async function pickFeedAds(count: number): Promise<ReelsFeedAdItem[]> {
  await ensureReelsAdsTables();
  const cfg = await getReelsPlatformConfig();
  if (!cfg.ads.enabled || !cfg.ads.feedAdsEnabled || count <= 0) return [];

  const out: ReelsFeedAdItem[] = [];
  for (let i = 0; i < count; i++) {
    const row = await pickCreative("feed_instream")
      ?? await pickCreative("shorts_feed");
    if (!row) break;
    out.push(mapFeedAd(row));
  }
  return out;
}

/** YouTube-style: ads appear after a random number of videos within [minGap, maxGap]. */
export function planFeedAdPlacements(
  videoCount: number,
  ads: ReelsFeedAdItem[],
  minGap: number,
  maxGap: number,
): ReelsFeedAdPlacement[] {
  if (videoCount <= 0 || ads.length === 0) return [];
  const min = Math.max(1, minGap);
  const max = Math.max(min, maxGap);
  const placements: ReelsFeedAdPlacement[] = [];
  let adIdx = 0;
  let videosSinceAd = 0;
  let nextGap = min + Math.floor(Math.random() * (max - min + 1));

  for (let i = 0; i < videoCount && adIdx < ads.length; i++) {
    videosSinceAd++;
    if (videosSinceAd >= nextGap) {
      placements.push({ insertAfterIndex: i, ad: ads[adIdx++] });
      videosSinceAd = 0;
      nextGap = min + Math.floor(Math.random() * (max - min + 1));
    }
  }
  return placements;
}

export async function pickFeedAdPlacementsForBatch(
  videoCount: number,
  minGap: number,
  maxGap: number,
): Promise<ReelsFeedAdPlacement[]> {
  await ensureReelsAdsTables();
  const cfg = await getReelsPlatformConfig();
  if (!cfg.ads.enabled || !cfg.ads.feedAdsEnabled || videoCount <= 0) return [];

  const min = Math.max(1, minGap);
  const maxAds = Math.max(1, Math.ceil(videoCount / min));
  const ads = await pickFeedAds(maxAds);
  return planFeedAdPlacements(videoCount, ads, minGap, maxGap);
}

async function chargeAdvertiser(opts: {
  creativeId: number;
  campaignId: number;
  costInr: number;
}): Promise<boolean> {
  if (opts.costInr <= 0) return true;
  const r = await query(
    `UPDATE reels_advertisers adv
     SET balance_inr = balance_inr - $1, updated_at = NOW()
     FROM reels_ad_campaigns camp
     JOIN reels_ad_creatives cr ON cr.campaign_id = camp.id
     WHERE cr.id = $2 AND camp.id = $3 AND adv.id = camp.advertiser_id
       AND adv.balance_inr >= $1
     RETURNING adv.id`,
    [opts.costInr, opts.creativeId, opts.campaignId],
  );
  if (!r.rows.length) return false;
  await query(
    `UPDATE reels_ad_campaigns SET spent_inr = spent_inr + $1, updated_at = NOW() WHERE id = $2`,
    [opts.costInr, opts.campaignId],
  );
  return true;
}

async function getCreativeBillingContext(creativeId: number): Promise<CreativeRow | null> {
  const r = await query(
    `SELECT cr.id, camp.id AS campaign_id, camp.bid_model, camp.bid_amount_inr, adv.balance_inr
     FROM reels_ad_creatives cr
     JOIN reels_ad_campaigns camp ON camp.id = cr.campaign_id
     JOIN reels_advertisers adv ON adv.id = camp.advertiser_id
     WHERE cr.id = $1`,
    [creativeId],
  );
  return (r.rows[0] as CreativeRow | undefined) ?? null;
}

function impressionCostInr(bidModel: string, bidAmount: number, ads: ReelsAdsRules): number {
  const amt = bidAmount > 0 ? bidAmount : ads.feedCpmInr;
  if (bidModel === "cpm") return amt / 1000;
  if (bidModel === "cpv") return amt;
  return 0;
}

function clickCostInr(bidModel: string, bidAmount: number, ads: ReelsAdsRules): number {
  const amt = bidAmount > 0 ? bidAmount : ads.feedCpcInr;
  if (bidModel === "cpc") return amt;
  if (bidModel === "cpi") return amt > 0 ? amt : ads.appInstallCpiInr;
  return ads.feedCpcInr;
}

function fallbackAdBreakItem(
  partial: Pick<ReelsAdBreakItem, "id" | "videoUrl" | "durationSeconds" | "skipAfterSeconds" | "adType">,
): ReelsAdBreakItem {
  return {
    title: "Sponsored",
    placement: "pre_roll",
    advertiserName: "Videh",
    format: "video",
    headline: "Discover Videh Video",
    description: "Watch, upload, and subscribe on Videh.",
    imageUrl: null,
    ctaType: "learn_more",
    destinationUrl: "https://videh.co.in",
    playStoreUrl: null,
    appStoreUrl: null,
    appName: null,
    appDeveloper: "Videh",
    appRating: null,
    appReviewCount: null,
    appDownloadCount: null,
    appCategory: null,
    appPriceLabel: "FREE",
    promoImageUrl: null,
    promoImageUrl2: null,
    sponsoredLabel: "Sponsored",
    ...partial,
  };
}

function fallbackPreRoll(ads: ReelsAdsRules): ReelsAdBreakItem[] {
  return [
    fallbackAdBreakItem({
      id: 0,
      videoUrl: ads.fallbackNonSkipUrl,
      durationSeconds: ads.preRollNonSkipSeconds,
      skipAfterSeconds: null,
      adType: "non_skippable",
    }),
    fallbackAdBreakItem({
      id: -1,
      videoUrl: ads.fallbackSkippableUrl,
      durationSeconds: ads.preRollSkippableSeconds,
      skipAfterSeconds: ads.preRollSkipAfterSeconds,
      adType: "skippable",
    }),
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

  const bumper = await pickCreative("pre_roll", "bumper");
  if (bumper) {
    preRoll.push(mapCreative(
      { ...bumper, duration_seconds: Math.min(6, bumper.duration_seconds || 6) },
      "pre_roll",
    ));
  }

  const nonSkip = await pickCreative("pre_roll", "non_skippable");
  if (nonSkip) {
    preRoll.push(mapCreative(
      { ...nonSkip, duration_seconds: nonSkip.duration_seconds || ads.preRollNonSkipSeconds },
      "pre_roll",
    ));
  } else if (!bumper) {
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
      : { ...fallbackAdBreakItem({
        id: -2,
        videoUrl: ads.fallbackMidRollUrl,
        durationSeconds: ads.midRollSeconds,
        skipAfterSeconds: null,
        adType: "non_skippable",
      }), placement: "mid_roll" as const };
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
  viewerCity?: string;
  viewerState?: string;
  viewerCountry?: string;
}): Promise<void> {
  await ensureReelsAdsTables();
  if (opts.creativeId <= 0) return;
  const cfg = await getReelsPlatformConfig();
  const ctx = await getCreativeBillingContext(opts.creativeId);
  let cost = 0;
  if (ctx?.campaign_id) {
    const bidModel = String(ctx.bid_model ?? "cpm");
    const bidAmt = Number(ctx.bid_amount_inr) || 0;
    if (opts.placement === "feed_instream") {
      cost = impressionCostInr(bidModel, bidAmt, cfg.ads);
    } else if (opts.completed && bidModel === "cpv") {
      cost = bidAmt > 0 ? bidAmt : cfg.ads.videoCpvInr;
    }
    if (cost > 0) {
      const ok = await chargeAdvertiser({ creativeId: opts.creativeId, campaignId: Number(ctx.campaign_id), costInr: cost });
      if (!ok) return;
    }
  }
  await query(
    `INSERT INTO reels_ad_impressions
      (creative_id, content_video_id, viewer_user_id, placement, watched_seconds, skipped, completed, cost_inr,
       viewer_city, viewer_state, viewer_country)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      opts.creativeId,
      opts.contentVideoId || null,
      opts.viewerUserId || null,
      opts.placement,
      opts.watchedSeconds,
      opts.skipped,
      opts.completed,
      cost,
      opts.viewerCity ?? null,
      opts.viewerState ?? null,
      opts.viewerCountry ?? "India",
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

export async function recordReelsAdClick(opts: {
  creativeId: number;
  viewerUserId: number;
  placement: string;
  clickTarget: "cta" | "play_store" | "app_store" | "destination";
  viewerCity?: string;
  viewerState?: string;
  viewerCountry?: string;
}): Promise<{ success: boolean }> {
  await ensureReelsAdsTables();
  if (opts.creativeId <= 0) return { success: false };
  const cfg = await getReelsPlatformConfig();
  const ctx = await getCreativeBillingContext(opts.creativeId);
  if (!ctx?.campaign_id) return { success: false };
  const bidModel = String(ctx.bid_model ?? "cpc");
  const bidAmt = Number(ctx.bid_amount_inr) || 0;
  const cost = clickCostInr(bidModel, bidAmt, cfg.ads);
  if (cost > 0) {
    const ok = await chargeAdvertiser({
      creativeId: opts.creativeId,
      campaignId: Number(ctx.campaign_id),
      costInr: cost,
    });
    if (!ok) return { success: false };
  }
  await query(
    `INSERT INTO reels_ad_impressions
      (creative_id, viewer_user_id, placement, watched_seconds, skipped, completed, clicked, cost_inr,
       viewer_city, viewer_state, viewer_country)
     VALUES ($1, $2, $3, 0, FALSE, FALSE, TRUE, $4, $5, $6, $7)`,
    [
      opts.creativeId,
      opts.viewerUserId || null,
      opts.placement,
      cost,
      opts.viewerCity ?? null,
      opts.viewerState ?? null,
      opts.viewerCountry ?? "India",
    ],
  );
  await query(`UPDATE reels_ad_creatives SET impressions = impressions + 1, clicks = clicks + 1 WHERE id = $1`, [opts.creativeId]);
  return { success: true };
}

export function defaultBidForObjective(objective: ReelsAdObjective, ads: ReelsAdsRules): { bidModel: ReelsAdBidModel; bidAmount: number } {
  switch (objective) {
    case "app_promotion":
      return { bidModel: "cpi", bidAmount: ads.appInstallCpiInr };
    case "shopping":
      return { bidModel: "cpc", bidAmount: ads.feedCpcInr };
    case "video_views":
      return { bidModel: "cpv", bidAmount: ads.videoCpvInr };
    default:
      return { bidModel: "cpm", bidAmount: ads.feedCpmInr };
  }
}

export async function topUpAdvertiserBalance(advertiserId: number, amountInr: number): Promise<void> {
  await ensureReelsAdsTables();
  await query(
    `UPDATE reels_advertisers SET balance_inr = balance_inr + $1, updated_at = NOW() WHERE id = $2`,
    [Math.max(0, amountInr), advertiserId],
  );
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

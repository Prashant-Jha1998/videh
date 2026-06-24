import type { AdFormatSpec } from "./adFormats";

export type CampaignObjective = "brand_awareness" | "shopping" | "app_promotion" | "video_views";

/** Default ad format when advertiser picks a campaign or creates one. */
export const DEFAULT_FORMAT_BY_OBJECTIVE: Record<CampaignObjective, string> = {
  app_promotion: "feed_app_install",
  shopping: "feed_shopping",
  video_views: "non_skippable_preroll",
  brand_awareness: "feed_image",
};

/** Formats whose bid model aligns with the campaign objective. */
export const COMPATIBLE_FORMAT_IDS: Record<CampaignObjective, string[]> = {
  app_promotion: ["feed_app_install"],
  shopping: ["feed_shopping", "carousel"],
  video_views: ["non_skippable_preroll", "skippable_preroll", "bumper", "mid_roll", "feed_video", "shorts_video"],
  brand_awareness: ["feed_image", "non_skippable_preroll", "skippable_preroll", "bumper", "mid_roll", "feed_video", "shorts_video"],
};

export const OBJECTIVE_HINTS: Record<CampaignObjective, string> = {
  app_promotion:
    "App promotion campaigns bill per install tap (CPI). Use the App install card format and paste your Play Store / App Store link — the Install button opens the store.",
  shopping:
    "Shopping campaigns bill per click (CPC). Use Shopping / product card and add your shop URL for the Shop now button.",
  video_views:
    "Video view campaigns bill per completed view (CPV). Use pre-roll, mid-roll, bumper, or Shorts video formats.",
  brand_awareness:
    "Brand awareness campaigns bill per impression (CPM). Image cards and video formats work best.",
};

export function isCampaignObjective(v: string | undefined): v is CampaignObjective {
  return v === "brand_awareness" || v === "shopping" || v === "app_promotion" || v === "video_views";
}

export function formatMatchesObjective(formatId: string, objective: CampaignObjective, formats: AdFormatSpec[]): boolean {
  const spec = formats.find((f) => f.id === formatId);
  if (!spec) return false;
  const compatible = COMPATIBLE_FORMAT_IDS[objective];
  if (compatible.includes(formatId)) return true;
  const objBid = objectiveBidModel(objective);
  return spec.bidModel === objBid;
}

function objectiveBidModel(objective: CampaignObjective): string {
  switch (objective) {
    case "app_promotion":
      return "cpi";
    case "shopping":
      return "cpc";
    case "video_views":
      return "cpv";
    default:
      return "cpm";
  }
}

export function recommendedFormatLabel(objective: CampaignObjective, formats: AdFormatSpec[]): string {
  const id = DEFAULT_FORMAT_BY_OBJECTIVE[objective];
  return formats.find((f) => f.id === id)?.label ?? id;
}

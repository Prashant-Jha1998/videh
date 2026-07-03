export type AdFormatSpec = {
  id: string;
  label: string;
  category: "video_watch" | "home_feed" | "shorts" | "vibe" | "display";
  description: string;
  where: string;
  format: string;
  placement: string;
  adType: string;
  maxDurationSeconds: number | null;
  skipAfterSeconds: number | null;
  bidModel: string;
  requiresVideo: boolean;
  requiresImage: boolean;
  live: boolean;
};

export const CATEGORY_LABELS: Record<AdFormatSpec["category"], string> = {
  video_watch: "Video watch ads",
  home_feed: "Home feed ads",
  shorts: "Shorts ads",
  vibe: "Vibe ads (premium vertical)",
  display: "Display & discovery",
};

export const BID_MODEL_LABELS: Record<string, string> = {
  cpm: "CPM — per 1,000 impressions",
  cpc: "CPC — per click",
  cpv: "CPV — per completed view",
  cpi: "CPI — per app install tap",
};

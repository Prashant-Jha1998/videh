/** All ad formats available on ads.videh.co.in — no third-party brand names. */
export type AdFormatId =
  | "non_skippable_preroll"
  | "skippable_preroll"
  | "bumper"
  | "mid_roll"
  | "feed_image"
  | "feed_video"
  | "feed_shopping"
  | "feed_app_install"
  | "shorts_video"
  | "search_promoted"
  | "channel_banner"
  | "video_overlay"
  | "carousel"
  | "lead_form";

export type AdFormatSpec = {
  id: AdFormatId;
  label: string;
  category: "video_watch" | "home_feed" | "shorts" | "display";
  description: string;
  where: string;
  format: string;
  placement: string;
  adType: "non_skippable" | "skippable" | "bumper";
  maxDurationSeconds: number | null;
  skipAfterSeconds: number | null;
  bidModel: "cpm" | "cpc" | "cpv" | "cpi";
  requiresVideo: boolean;
  requiresImage: boolean;
  live: boolean;
};

export const AD_FORMATS_CATALOG: AdFormatSpec[] = [
  {
    id: "non_skippable_preroll",
    label: "Non-skippable pre-roll",
    category: "video_watch",
    description: "30-second video plays before the main video. Viewer must watch fully.",
    where: "Video player — before content starts",
    format: "video",
    placement: "pre_roll",
    adType: "non_skippable",
    maxDurationSeconds: 30,
    skipAfterSeconds: null,
    bidModel: "cpv",
    requiresVideo: true,
    requiresImage: false,
    live: true,
  },
  {
    id: "skippable_preroll",
    label: "Skippable pre-roll",
    category: "video_watch",
    description: "Up to 60-second video before content. Skip button after 5 seconds.",
    where: "Video player — before content starts",
    format: "video",
    placement: "pre_roll",
    adType: "skippable",
    maxDurationSeconds: 60,
    skipAfterSeconds: 5,
    bidModel: "cpv",
    requiresVideo: true,
    requiresImage: false,
    live: true,
  },
  {
    id: "bumper",
    label: "Bumper (6s)",
    category: "video_watch",
    description: "Short 6-second non-skippable brand message before or between videos.",
    where: "Video player — pre-roll slot",
    format: "bumper",
    placement: "pre_roll",
    adType: "bumper",
    maxDurationSeconds: 6,
    skipAfterSeconds: null,
    bidModel: "cpm",
    requiresVideo: true,
    requiresImage: false,
    live: true,
  },
  {
    id: "mid_roll",
    label: "Mid-roll",
    category: "video_watch",
    description: "30-second ad during long videos (8+ minutes). Non-skippable.",
    where: "Video player — during playback",
    format: "video",
    placement: "mid_roll",
    adType: "non_skippable",
    maxDurationSeconds: 30,
    skipAfterSeconds: null,
    bidModel: "cpv",
    requiresVideo: true,
    requiresImage: false,
    live: true,
  },
  {
    id: "feed_image",
    label: "In-feed image card",
    category: "home_feed",
    description: "Sponsored image card between videos in the home feed.",
    where: "Home feed — every 2 videos",
    format: "image",
    placement: "feed_instream",
    adType: "non_skippable",
    maxDurationSeconds: null,
    skipAfterSeconds: null,
    bidModel: "cpm",
    requiresVideo: false,
    requiresImage: true,
    live: true,
  },
  {
    id: "feed_video",
    label: "In-feed video card",
    category: "home_feed",
    description: "Sponsored video thumbnail card in the home feed with tap-to-watch.",
    where: "Home feed — between videos",
    format: "video",
    placement: "feed_instream",
    adType: "non_skippable",
    maxDurationSeconds: 30,
    skipAfterSeconds: null,
    bidModel: "cpm",
    requiresVideo: true,
    requiresImage: false,
    live: true,
  },
  {
    id: "feed_shopping",
    label: "Shopping / product card",
    category: "home_feed",
    description: "Product image with Shop Now button — e-commerce campaigns.",
    where: "Home feed — between videos",
    format: "shopping",
    placement: "feed_instream",
    adType: "non_skippable",
    maxDurationSeconds: null,
    skipAfterSeconds: null,
    bidModel: "cpc",
    requiresVideo: false,
    requiresImage: true,
    live: true,
  },
  {
    id: "feed_app_install",
    label: "App install card",
    category: "home_feed",
    description: "App icon, headline, Play Store & App Store install buttons.",
    where: "Home feed — between videos",
    format: "app_install",
    placement: "feed_instream",
    adType: "non_skippable",
    maxDurationSeconds: null,
    skipAfterSeconds: null,
    bidModel: "cpi",
    requiresVideo: false,
    requiresImage: true,
    live: true,
  },
  {
    id: "shorts_video",
    label: "Shorts vertical video",
    category: "shorts",
    description: "Full-screen vertical video ad in the Shorts-style swipe feed.",
    where: "Shorts / vertical feed",
    format: "shorts_video",
    placement: "shorts_feed",
    adType: "skippable",
    maxDurationSeconds: 15,
    skipAfterSeconds: 3,
    bidModel: "cpv",
    requiresVideo: true,
    requiresImage: false,
    live: true,
  },
  {
    id: "search_promoted",
    label: "Promoted discovery",
    category: "display",
    description: "Thumbnail + headline shown in search and discovery results.",
    where: "Search & discovery",
    format: "image",
    placement: "search_promoted",
    adType: "non_skippable",
    maxDurationSeconds: null,
    skipAfterSeconds: null,
    bidModel: "cpc",
    requiresVideo: false,
    requiresImage: true,
    live: false,
  },
  {
    id: "channel_banner",
    label: "Channel masthead banner",
    category: "display",
    description: "Wide banner on channel pages for brand campaigns.",
    where: "Channel page top",
    format: "image",
    placement: "channel_banner",
    adType: "non_skippable",
    maxDurationSeconds: null,
    skipAfterSeconds: null,
    bidModel: "cpm",
    requiresVideo: false,
    requiresImage: true,
    live: false,
  },
  {
    id: "video_overlay",
    label: "Video overlay banner",
    category: "display",
    description: "Small banner overlay on bottom of video during playback.",
    where: "Video player — overlay",
    format: "image",
    placement: "video_overlay",
    adType: "non_skippable",
    maxDurationSeconds: null,
    skipAfterSeconds: null,
    bidModel: "cpc",
    requiresVideo: false,
    requiresImage: true,
    live: false,
  },
  {
    id: "carousel",
    label: "Carousel / multi-image",
    category: "home_feed",
    description: "Swipeable product or image carousel in the home feed.",
    where: "Home feed — between videos",
    format: "carousel",
    placement: "feed_instream",
    adType: "non_skippable",
    maxDurationSeconds: null,
    skipAfterSeconds: null,
    bidModel: "cpc",
    requiresVideo: false,
    requiresImage: true,
    live: false,
  },
  {
    id: "lead_form",
    label: "Lead form ad",
    category: "home_feed",
    description: "Collect leads with headline + Sign up / Contact CTA in feed.",
    where: "Home feed — between videos",
    format: "lead_form",
    placement: "feed_instream",
    adType: "non_skippable",
    maxDurationSeconds: null,
    skipAfterSeconds: null,
    bidModel: "cpc",
    requiresVideo: false,
    requiresImage: true,
    live: false,
  },
];

export function findAdFormat(id: string): AdFormatSpec | undefined {
  return AD_FORMATS_CATALOG.find((f) => f.id === id);
}

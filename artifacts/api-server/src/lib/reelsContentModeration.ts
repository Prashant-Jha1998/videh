import fs from "node:fs";
import path from "node:path";
import { query } from "./db";
import { getReelsPlatformConfig } from "./reelsConfig";
import { ensureReelsModerationColumns } from "./reelsSchema";

export type ModerationScanResult = {
  action: "approve" | "reject" | "pending";
  reason?: string;
  nsfwScore: number;
  details: Record<string, unknown>;
};

const NSFW_TEXT_PATTERNS = [
  /\b(porn|porno|pornography|xxx|nsfw|nude|nudity|naked|nudes|sex\s*tape|sex\s*video|adult\s*only)\b/i,
  /\b(blowjob|handjob|orgasm|masturbat|erotic|hentai|onlyfans|stripper|escort\s*service)\b/i,
  /\b(chudai|chudai|nangi|nanga|nude\s*video|blue\s*film|gandi\s*video|sex\s*scene)\b/i,
  /\b(ब्लू फिल्म|नंगी|नग्न|अश्लील|सेक्स वीडियो)\b/u,
  /\b(#nsfw|#nude|#porn|#adultonly|#sexvideo)\b/i,
];

type SafeSearchLevel = "UNKNOWN" | "VERY_UNLIKELY" | "UNLIKELY" | "POSSIBLE" | "LIKELY" | "VERY_LIKELY";

function levelScore(level: string): number {
  const map: Record<string, number> = {
    UNKNOWN: 0.2,
    VERY_UNLIKELY: 0.05,
    UNLIKELY: 0.15,
    POSSIBLE: 0.45,
    LIKELY: 0.75,
    VERY_LIKELY: 0.95,
  };
  return map[level] ?? 0.2;
}

function isBlockedSafeSearch(adult: string, racy: string, threshold: number): boolean {
  const score = Math.max(levelScore(adult), levelScore(racy) * 0.9);
  return score >= threshold;
}

export function scanReelsText(text: string): { blocked: boolean; reason?: string; matches: string[] } {
  const normalized = text.toLowerCase();
  const matches: string[] = [];
  for (const p of NSFW_TEXT_PATTERNS) {
    const m = normalized.match(p);
    if (m) matches.push(m[0]);
  }
  if (matches.length) {
    return { blocked: true, reason: "Sexual or nudity-related text is not allowed.", matches };
  }
  return { blocked: false, matches: [] };
}

async function scanImageGoogleVision(filePath: string, threshold: number): Promise<{ blocked: boolean; score: number; raw?: unknown }> {
  const key = process.env.GOOGLE_VISION_API_KEY?.trim();
  if (!key || !fs.existsSync(filePath)) return { blocked: false, score: 0 };

  const content = fs.readFileSync(filePath).toString("base64");
  const res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [{
        image: { content },
        features: [{ type: "SAFE_SEARCH_DETECTION", maxResults: 1 }],
      }],
    }),
  });
  const data = await res.json() as {
    responses?: { safeSearchAnnotation?: { adult?: string; racy?: string; violence?: string } }[];
  };
  const ann = data.responses?.[0]?.safeSearchAnnotation;
  if (!ann) return { blocked: false, score: 0, raw: data };

  const adult = String(ann.adult ?? "UNKNOWN") as SafeSearchLevel;
  const racy = String(ann.racy ?? "UNKNOWN") as SafeSearchLevel;
  const score = Math.max(levelScore(adult), levelScore(racy) * 0.9);
  return {
    blocked: isBlockedSafeSearch(adult, racy, threshold),
    score,
    raw: ann,
  };
}

async function scanImageSightengine(filePath: string, threshold: number): Promise<{ blocked: boolean; score: number; raw?: unknown }> {
  const user = process.env.SIGHTENGINE_API_USER?.trim();
  const secret = process.env.SIGHTENGINE_API_SECRET?.trim();
  if (!user || !secret || !fs.existsSync(filePath)) return { blocked: false, score: 0 };

  const form = new FormData();
  const buf = fs.readFileSync(filePath);
  form.append("media", new Blob([buf]), path.basename(filePath));
  form.append("models", "nudity,wad,offensive");
  form.append("api_user", user);
  form.append("api_secret", secret);

  const res = await fetch("https://api.sightengine.com/1.0/check.json", { method: "POST", body: form });
  const data = await res.json() as {
    status?: string;
    nudity?: { raw?: number; partial?: number; safe?: number };
    weapon?: number;
    alcohol?: number;
    drugs?: number;
  };
  if (data.status !== "success") return { blocked: false, score: 0, raw: data };

  const raw = Number(data.nudity?.raw ?? 0);
  const partial = Number(data.nudity?.partial ?? 0);
  const score = Math.max(raw, partial * 0.85);
  return { blocked: score >= threshold, score, raw: data };
}

async function scanVideoSightengine(
  videoUrl: string,
  threshold: number,
): Promise<{ blocked: boolean; score: number; pending: boolean; raw?: unknown }> {
  const user = process.env.SIGHTENGINE_API_USER?.trim();
  const secret = process.env.SIGHTENGINE_API_SECRET?.trim();
  if (!user || !secret) return { blocked: false, score: 0, pending: false };

  const params = new URLSearchParams({
    url: videoUrl,
    models: "nudity,wad,offensive",
    api_user: user,
    api_secret: secret,
  });
  const res = await fetch(`https://api.sightengine.com/1.0/video/sync.json?${params}`);
  const data = await res.json() as {
    status?: string;
    error?: { message?: string };
    data?: { frames?: { nudity?: { raw?: number; partial?: number } }[] };
  };

  if (data.status === "failure" && String(data.error?.message ?? "").includes("async")) {
    return { blocked: false, score: 0, pending: true, raw: data };
  }
  if (data.status !== "success") return { blocked: false, score: 0, pending: false, raw: data };

  let maxScore = 0;
  for (const frame of data.data?.frames ?? []) {
    const raw = Number(frame.nudity?.raw ?? 0);
    const partial = Number(frame.nudity?.partial ?? 0);
    maxScore = Math.max(maxScore, raw, partial * 0.85);
  }
  return { blocked: maxScore >= threshold, score: maxScore, pending: false, raw: data };
}

async function logModeration(
  videoId: number | null,
  scanType: string,
  result: string,
  score: number,
  details: Record<string, unknown>,
): Promise<void> {
  await ensureReelsModerationColumns();
  await query(
    `INSERT INTO reels_moderation_log (video_id, scan_type, result, score, details) VALUES ($1, $2, $3, $4, $5)`,
    [videoId, scanType, result, score, JSON.stringify(details)],
  );
}

export async function moderateReelsUpload(opts: {
  videoId?: number;
  title: string;
  description: string;
  hashtags: string[];
  thumbnailPath?: string | null;
  videoPublicUrl: string;
  durationSeconds: number;
}): Promise<ModerationScanResult> {
  const config = await getReelsPlatformConfig();
  const cm = config.contentModeration;
  if (!cm.enabled) {
    return { action: "approve", nsfwScore: 0, details: { skipped: "moderation_disabled" } };
  }
  const threshold = cm.nsfwBlockThreshold;
  const combinedText = [opts.title, opts.description, ...opts.hashtags.map((h) => `#${h}`)].join(" ");

  const textScan = scanReelsText(combinedText);
  if (textScan.blocked) {
    await logModeration(opts.videoId ?? null, "text", "reject", 1, { matches: textScan.matches });
    return {
      action: "reject",
      reason: textScan.reason ?? "Sexual or nudity content blocked in title/description.",
      nsfwScore: 1,
      details: { text: textScan },
    };
  }

  let maxScore = 0;
  const details: Record<string, unknown> = { text: textScan };

  if (opts.thumbnailPath) {
    const [vision, sight] = await Promise.all([
      scanImageGoogleVision(opts.thumbnailPath, threshold),
      scanImageSightengine(opts.thumbnailPath, threshold),
    ]);
    const thumbScore = Math.max(vision.score, sight.score);
    maxScore = Math.max(maxScore, thumbScore);
    details.thumbnail = { vision, sight };
    await logModeration(opts.videoId ?? null, "thumbnail", thumbScore >= threshold ? "reject" : "pass", thumbScore, details.thumbnail as Record<string, unknown>);
    if (vision.blocked || sight.blocked) {
      return {
        action: "reject",
        reason: "Thumbnail contains nudity or sexual content.",
        nsfwScore: thumbScore,
        details,
      };
    }
  } else if (cm.requireThumbnail) {
    return {
      action: "reject",
      reason: "Thumbnail is required for content safety review.",
      nsfwScore: 0,
      details,
    };
  }

  const hasVision = Boolean(process.env.GOOGLE_VISION_API_KEY?.trim() || process.env.SIGHTENGINE_API_USER?.trim());
  if (!hasVision && cm.blockWithoutVisionApi) {
    return {
      action: "pending",
      reason: "Queued for manual safety review.",
      nsfwScore: maxScore,
      details: { ...details, note: "vision_api_unconfigured" },
    };
  }

  if (hasVision && opts.videoPublicUrl) {
    const videoScan = await scanVideoSightengine(opts.videoPublicUrl, threshold);
    maxScore = Math.max(maxScore, videoScan.score);
    details.video = videoScan;
    await logModeration(opts.videoId ?? null, "video", videoScan.blocked ? "reject" : videoScan.pending ? "pending" : "pass", videoScan.score, videoScan as unknown as Record<string, unknown>);

    if (videoScan.blocked) {
      return {
        action: "reject",
        reason: "Video contains nudity or sexual content.",
        nsfwScore: videoScan.score,
        details,
      };
    }
    if (videoScan.pending || opts.durationSeconds > cm.syncVideoScanMaxSeconds) {
      return {
        action: "pending",
        reason: "Video is being scanned for nudity and sexual content. It will appear when approved.",
        nsfwScore: maxScore,
        details,
      };
    }
  }

  return { action: "approve", nsfwScore: maxScore, details };
}

export async function applyVideoModerationResult(
  videoId: number,
  result: ModerationScanResult,
): Promise<void> {
  await ensureReelsModerationColumns();
  if (result.action === "reject") {
    await query(
      `UPDATE reels_videos SET
         status = 'removed', play_enabled = FALSE, moderation_status = 'rejected',
         moderation_reason = $2, moderation_scanned_at = NOW(), nsfw_score = $3,
         moderation_details = $4
       WHERE id = $1`,
      [videoId, result.reason ?? "Content policy violation", result.nsfwScore, JSON.stringify(result.details)],
    );
    return;
  }
  if (result.action === "pending") {
    await query(
      `UPDATE reels_videos SET
         status = 'pending_review', play_enabled = FALSE, moderation_status = 'pending_scan',
         moderation_reason = $2, nsfw_score = $3, moderation_details = $4
       WHERE id = $1`,
      [videoId, result.reason ?? null, result.nsfwScore, JSON.stringify(result.details)],
    );
    return;
  }
  await query(
    `UPDATE reels_videos SET
       status = 'published', play_enabled = TRUE, moderation_status = 'approved',
       moderation_scanned_at = NOW(), nsfw_score = $2, moderation_details = $3, moderation_reason = NULL
     WHERE id = $1`,
    [videoId, result.nsfwScore, JSON.stringify(result.details)],
  );
}

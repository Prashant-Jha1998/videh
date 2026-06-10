import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { query } from "../lib/db";
import { assertSameUser, getAuthUserId } from "../lib/auth";
import { ensureVideoThumbnail } from "../lib/reelsAutoThumbnail";
import { permanentlyDeleteReelsVideo } from "../lib/reelsDeleteVideo";
import { externalVideoRedirectTarget, tryStreamStoredReelsVideo } from "../lib/reelsVideoStream";
import {
  detectImageMimeType,
  localPathForUploadsRel,
  publicMediaUrl,
  resolveStoredMediaUrl,
  uploadsRelPathFromStoredUrl,
} from "../lib/mediaStorage";
import {
  ensureReelsTables,
  MAX_REELS_VIDEO_SECONDS,
  normalizeReelsHandle,
} from "../lib/reelsSchema";
import { getReelsPlatformConfig, publicReelsRules } from "../lib/reelsConfig";
import { checkCommentFraud, checkSubscribeFraud, checkViewFraud, recordViewSession } from "../lib/reelsFraud";
import { fetchLatestReelsFeed, fetchTrendingReels, type FeedCursor } from "../lib/reelsFeed";
import { fetchHashtagStats, fetchHashtagSuggestions } from "../lib/reelsHashtags";
import { canPlayVideo, evaluateChannelMonetization } from "../lib/reelsMonetization";
import { notifySubscribersNewVideo } from "../lib/reelsNotifications";
import {
  applyVideoModerationResult,
  moderateReelsUpload,
  scanReelsText,
} from "../lib/reelsContentModeration";
import {
  isPhoneLikeQuery,
  mapPublicReelsChannel,
  mapPublicReelsComment,
  redactPhoneNumbersInText,
} from "../lib/reelsPrivacy";
import { resolveViewerGeoFromRequest } from "../lib/adsGeo";
import { pickFeedAdPlacementsForBatch, recordReelsAdClick, recordReelsAdImpression, resolveReelsAdBreaks } from "../lib/reelsAds";
import { cdnDeliveryEnabled, isS3MediaEnabled, scheduleS3Upload, tryRedirectStoredMediaToCdn } from "../lib/s3Storage";
import { buildReelsVideoDeepLink, buildReelsVideoShareUrl } from "../lib/reelsShareUrl";

const router = Router();
const currentFilePath = fileURLToPath(import.meta.url);
const routesDir = path.dirname(currentFilePath);
const apiServerDir = path.resolve(routesDir, "../..");
const reelsUploadsDir = path.join(apiServerDir, "uploads", "reels");
fs.mkdirSync(reelsUploadsDir, { recursive: true });

const reelsUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, reelsUploadsDir),
    filename: (_req, file, cb) => {
      const isImageField =
        file.fieldname === "avatar"
        || file.fieldname === "cover"
        || file.fieldname === "thumbnail"
        || /^image\//.test(file.mimetype);
      const fallbackExt = isImageField ? ".jpg" : ".mp4";
      const ext = path.extname(file.originalname || "") || fallbackExt;
      const safeExt = ext.replace(/[^.\w]/g, "") || fallbackExt;
      const prefix = file.fieldname === "avatar" ? "avatar"
        : file.fieldname === "cover" ? "cover"
          : file.fieldname === "thumbnail" ? "thumb"
            : "media";
      cb(null, `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString("hex")}${safeExt}`);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const isVideo = /^video\//.test(file.mimetype) || file.fieldname === "video";
    const isImage =
      /^image\//.test(file.mimetype)
      || file.fieldname === "thumbnail"
      || file.fieldname === "avatar"
      || file.fieldname === "cover";
    if (isVideo || isImage) cb(null, true);
    else cb(new Error("Only video and image files are allowed."));
  },
});

function runReelsUpload(req: Request, res: Response, next: NextFunction): void {
  reelsUpload.fields([
    { name: "video", maxCount: 1 },
    { name: "thumbnail", maxCount: 1 },
  ])(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    const message = err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE"
      ? "Video is too large (max 2 GB)."
      : err instanceof Error ? err.message : "Upload failed.";
    res.status(400).json({ success: false, message });
  });
}

function parseHashtags(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((t) => String(t).trim().replace(/^#/, "")).filter(Boolean).slice(0, 20);
  }
  const s = String(raw ?? "").trim();
  if (!s) return [];
  return s.split(/[\s,#]+/).map((t) => t.trim().replace(/^#/, "")).filter(Boolean).slice(0, 20);
}

function needsReelsImageProxy(url: string): boolean {
  return /images\.pexels\.com|picsum\.photos/i.test(url);
}

function proxyReelsImageUrl(req: Request, url: unknown): string | null {
  const u = String(url ?? "").trim();
  if (!u) return null;
  if (!needsReelsImageProxy(u)) return u;
  const proxy = publicMediaUrl(req, "/api/reels/proxy-image");
  return `${proxy}?url=${encodeURIComponent(u)}`;
}

/** Always return API thumbnail URL (handles wrong extensions, auto-frame, Pexels proxy). */
function resolveVideoThumbnailUrl(req: Request, _thumb: unknown, videoId: unknown, cacheVersion?: unknown): string {
  const v = cacheVersion != null ? encodeURIComponent(String(cacheVersion)) : "";
  const q = v ? `?v=${v}` : "";
  return publicMediaUrl(req, `/api/reels/videos/${videoId}/thumbnail${q}`);
}

/** CDN direct URL when S3/CloudFront is configured; otherwise API stream (Range support). */
function resolveVideoPlaybackUrl(req: Request, storedUrl: unknown, videoId: unknown): string {
  const raw = String(storedUrl ?? "").trim();
  if (!raw) return "";
  if (!uploadsRelPathFromStoredUrl(raw) && /^https?:\/\//i.test(raw)) return raw;
  const rel = uploadsRelPathFromStoredUrl(raw);
  if (rel && cdnDeliveryEnabled()) {
    return publicMediaUrl(req, rel);
  }
  const external = resolveStoredMediaUrl(req, raw);
  if (external && /^https?:\/\//i.test(external) && !uploadsRelPathFromStoredUrl(external)) {
    return external;
  }
  return publicMediaUrl(req, `/api/reels/videos/${videoId}/stream`);
}

function mapVideoRow(row: Record<string, unknown>, req?: Request) {
  const thumb = row.thumbnail_url ?? null;
  const avatar = row.channel_avatar_url ?? null;
  const channelLabel = String(row.channel_display_name ?? "").trim()
    || (row.channel_handle ? `@${row.channel_handle}` : null);
  return {
    id: row.id,
    channelId: row.channel_id,
    title: redactPhoneNumbersInText(String(row.title ?? "")),
    description: redactPhoneNumbersInText(String(row.description ?? "")),
    hashtags: row.hashtags ?? [],
    videoUrl: req ? resolveVideoPlaybackUrl(req, row.video_url, row.id) : String(row.video_url ?? ""),
    thumbnailUrl: req ? resolveVideoThumbnailUrl(req, thumb, row.id, row.updated_at ?? row.created_at) : (thumb ?? null),
    durationSeconds: Number(row.duration_seconds ?? 0),
    viewCount: Number(row.view_count ?? 0),
    likeCount: Number(row.like_count ?? 0),
    dislikeCount: Number(row.dislike_count ?? 0),
    commentCount: Number(row.comment_count ?? 0),
    shareCount: Number(row.share_count ?? 0),
    fraudScore: Number(row.fraud_score ?? 0),
    playEnabled: row.play_enabled !== false,
    status: row.status ?? "published",
    moderationStatus: row.moderation_status ?? "approved",
    moderationReason: row.moderation_reason ?? null,
    channelHandle: row.channel_handle ?? null,
    channelDisplayName: channelLabel,
    channelAvatarUrl: req && row.channel_id
      ? resolveChannelBrandingPublicUrl(req, Number(row.channel_id), avatar, "avatar", row.channel_updated_at ?? row.updated_at)
      : (avatar ?? null),
    myReaction: row.my_reaction ?? null,
    createdAt: row.created_at,
    shareUrl: buildReelsVideoShareUrl(row.id as number | string),
    deepLink: buildReelsVideoDeepLink(row.id as number | string),
  };
}

function resolveChannelBrandingPublicUrl(
  req: Request,
  channelId: number,
  storedUrl: unknown,
  kind: "avatar" | "cover",
  cacheVersion?: unknown,
): string | null {
  const raw = String(storedUrl ?? "").trim();
  if (!raw) return null;
  if (needsReelsImageProxy(raw)) return proxyReelsImageUrl(req, raw);
  const v = cacheVersion != null ? encodeURIComponent(String(cacheVersion)) : "";
  const q = v ? `?v=${v}` : "";
  return publicMediaUrl(req, `/api/reels/channels/${channelId}/${kind}${q}`);
}

function mapPublicChannelResponse(
  req: Request,
  row: Record<string, unknown>,
  viewerId?: number,
): Record<string, unknown> {
  const ch = mapPublicReelsChannel(row, viewerId);
  const channelId = Number(row.id);
  const version = row.updated_at ?? row.created_at;
  if (ch.avatarUrl) {
    ch.avatarUrl = resolveChannelBrandingPublicUrl(req, channelId, row.avatar_url, "avatar", version);
  }
  if (ch.coverUrl) {
    ch.coverUrl = resolveChannelBrandingPublicUrl(req, channelId, row.cover_url, "cover", version);
  }
  return ch;
}

type ChannelLinkInput = { title?: string; url?: string };

function normalizeChannelLinkUrl(raw: string): string | null {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return null;
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withProto);
    if (!["http:", "https:"].includes(u.protocol)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function mapChannelLinkRow(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    title: String(row.title ?? ""),
    url: String(row.url ?? ""),
    sortOrder: Number(row.sort_order ?? 0),
  };
}

async function fetchChannelLinks(channelId: number): Promise<Record<string, unknown>[]> {
  const res = await query(
    `SELECT id, title, url, sort_order
     FROM reels_channel_links
     WHERE channel_id = $1
     ORDER BY sort_order ASC, id ASC`,
    [channelId],
  );
  return res.rows.map((r) => mapChannelLinkRow(r as Record<string, unknown>));
}

async function fetchChannelPlaylists(
  channelId: number,
  isOwner: boolean,
): Promise<Record<string, unknown>[]> {
  const pl = await query(
    `SELECT p.id, p.title, p.description, p.created_at, p.updated_at,
            COUNT(pi.video_id)::int AS video_count,
            (
              SELECT v.thumbnail_url
              FROM reels_playlist_items pi2
              JOIN reels_videos v ON v.id = pi2.video_id
              WHERE pi2.playlist_id = p.id
                AND ($2::boolean OR (v.status = 'published' AND v.play_enabled = TRUE))
              ORDER BY pi2.sort_order ASC, pi2.video_id ASC
              LIMIT 1
            ) AS thumbnail_url
     FROM reels_playlists p
     LEFT JOIN reels_playlist_items pi ON pi.playlist_id = p.id
     LEFT JOIN reels_videos v ON v.id = pi.video_id
       AND ($2::boolean OR (v.status = 'published' AND v.play_enabled = TRUE))
     WHERE p.channel_id = $1
     GROUP BY p.id
     HAVING COUNT(pi.video_id) FILTER (
       WHERE $2::boolean OR (v.status = 'published' AND v.play_enabled = TRUE)
     ) > 0 OR $2::boolean
     ORDER BY p.updated_at DESC`,
    [channelId, isOwner],
  );
  return pl.rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    videoCount: Number(row.video_count ?? 0),
    thumbnailUrl: row.thumbnail_url ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

async function fetchChannelVideoCount(channelId: number, isOwner: boolean): Promise<number> {
  const res = await query(
    `SELECT COUNT(*)::int AS cnt
     FROM reels_videos v
     WHERE v.channel_id = $1
       AND ($2::boolean OR (v.status = 'published' AND v.play_enabled = TRUE))`,
    [channelId, isOwner],
  );
  return Number(res.rows[0]?.cnt ?? 0);
}

async function serveChannelBrandingAsset(
  req: Request,
  res: Response,
  kind: "avatar" | "cover",
): Promise<void> {
  const channelId = Number(req.params.channelId);
  if (!channelId) {
    res.status(400).end();
    return;
  }
  const column = kind === "avatar" ? "avatar_url" : "cover_url";
  try {
    const row = await query(`SELECT ${column} AS asset_url FROM reels_channels WHERE id = $1`, [channelId]);
    if (!row.rows.length) {
      res.status(404).end();
      return;
    }
    const stored = String(row.rows[0].asset_url ?? "").trim();
    if (!stored) {
      res.status(404).end();
      return;
    }
    const uploadsRoot = path.join(apiServerDir, "uploads");
    const filePath = localPathForUploadsRel(stored, uploadsRoot);
    if (!filePath || !fs.existsSync(filePath)) {
      if (tryRedirectStoredMediaToCdn(req, res, stored)) return;
      res.status(404).end();
      return;
    }
    res.type(detectImageMimeType(filePath));
    res.setHeader("Cache-Control", "public, max-age=600");
    res.sendFile(filePath);
  } catch (err) {
    req.log.error({ err, channelId, kind }, "reels channel branding asset");
    res.status(500).end();
  }
}

function runChannelBrandingUpload(req: Request, res: Response, next: NextFunction): void {
  reelsUpload.fields([
    { name: "avatar", maxCount: 1 },
    { name: "cover", maxCount: 1 },
  ])(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    const message = err instanceof Error ? err.message : "Upload failed.";
    res.status(400).json({ success: false, message });
  });
}

router.get("/proxy-image", async (req: Request, res: Response) => {
  const url = String(req.query.url ?? "").trim();
  if (!url.startsWith("https://images.pexels.com/") && !url.startsWith("https://picsum.photos/")) {
    res.status(400).json({ success: false, message: "Invalid image URL" });
    return;
  }
  try {
    const upstream = await fetch(url, {
      headers: {
        Referer: "https://www.pexels.com/",
        "User-Agent": "Videh-Messenger/1.0",
        Accept: "image/*",
      },
    });
    if (!upstream.ok) {
      res.status(upstream.status).end();
      return;
    }
    const ct = upstream.headers.get("content-type") ?? "image/jpeg";
    res.setHeader("Content-Type", ct);
    res.setHeader("Cache-Control", "public, max-age=86400");
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.send(buf);
  } catch (err) {
    req.log.error({ err }, "reels proxy-image");
    res.status(502).json({ success: false, message: "Image proxy failed" });
  }
});

/** Serve stored thumbnail or auto-extract a frame from the video file. */
router.get("/videos/:id/thumbnail", async (req: Request, res: Response) => {
  const videoId = Number(req.params.id);
  if (!videoId) {
    res.status(400).end();
    return;
  }
  try {
    const row = await query(
      `SELECT thumbnail_url, video_url, duration_seconds FROM reels_videos WHERE id = $1`,
      [videoId],
    );
    if (!row.rows.length) {
      res.status(404).end();
      return;
    }
    const stored = row.rows[0] as {
      thumbnail_url?: string | null;
      video_url?: string | null;
      duration_seconds?: number | null;
    };
    const uploadsRoot = path.join(apiServerDir, "uploads");
    const thumbStored = String(stored.thumbnail_url ?? "").trim();
    if (thumbStored) {
      const rel = uploadsRelPathFromStoredUrl(thumbStored);
      if (rel) {
        const filePath = localPathForUploadsRel(rel, uploadsRoot);
        if (filePath && fs.existsSync(filePath)) {
          res.type(detectImageMimeType(filePath));
          res.setHeader("Cache-Control", "public, max-age=86400");
          res.sendFile(filePath);
          return;
        }
        if (tryRedirectStoredMediaToCdn(req, res, thumbStored)) return;
      }
      if (needsReelsImageProxy(thumbStored)) {
        const proxied = proxyReelsImageUrl(req, thumbStored);
        if (proxied) {
          res.redirect(proxied);
          return;
        }
      }
      const external = resolveStoredMediaUrl(req, thumbStored);
      if (external && /^https?:\/\//i.test(external) && !needsReelsImageProxy(external)) {
        res.redirect(external);
        return;
      }
    }
    const generated = await ensureVideoThumbnail({
      videoId,
      videoStoredUrl: String(stored.video_url ?? ""),
      uploadsRootDir: uploadsRoot,
      durationSeconds: Number(stored.duration_seconds ?? 0),
    });
    if (generated) {
      const filePath = localPathForUploadsRel(generated, uploadsRoot);
      if (filePath && fs.existsSync(filePath)) {
        res.type(detectImageMimeType(filePath));
        res.setHeader("Cache-Control", "public, max-age=3600");
        res.sendFile(filePath);
        return;
      }
      if (tryRedirectStoredMediaToCdn(req, res, generated)) return;
    }
    res.status(404).end();
  } catch (err) {
    req.log.error({ err, videoId }, "reels video thumbnail");
    res.status(500).end();
  }
});

/** YouTube-style share link landing — opens Videh app or shows download prompt. */
router.get("/go/:videoId", async (req: Request, res: Response) => {
  const videoId = Number(req.params.videoId);
  if (!videoId) {
    res.status(400).send("Invalid video");
    return;
  }
  try {
    await ensureReelsTables();
    const row = await query(
      `SELECT v.title, v.status, v.play_enabled, c.handle, c.display_name
       FROM reels_videos v
       JOIN reels_channels c ON c.id = v.channel_id
       WHERE v.id = $1`,
      [videoId],
    );
    if (!row.rows.length) {
      res.status(404).send("Video not found");
      return;
    }
    const v = row.rows[0] as {
      title?: string;
      status?: string;
      play_enabled?: boolean;
      handle?: string;
      display_name?: string;
    };
    const published = v.status === "published" && v.play_enabled !== false;
    const title = String(v.title ?? "Videh Video").replace(/[<>&"]/g, (c) => (
      { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] ?? c
    ));
    const channel = String(v.display_name ?? v.handle ?? "Videh").replace(/[<>&"]/g, (c) => (
      { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] ?? c
    ));
    const deepLink = buildReelsVideoDeepLink(videoId);
    const shareUrl = buildReelsVideoShareUrl(videoId);
    const thumb = resolveVideoThumbnailUrl(req, null, videoId);
    res.type("html").send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${title} — Videh</title>
  <meta property="og:title" content="${title}"/>
  <meta property="og:description" content="Watch on Videh — ${channel}"/>
  <meta property="og:url" content="${shareUrl}"/>
  <meta property="og:image" content="${thumb}"/>
  <meta property="og:type" content="video.other"/>
  <style>
    body{font-family:system-ui,sans-serif;background:#0b141a;color:#e9edef;margin:0;padding:24px;text-align:center}
    .card{max-width:420px;margin:40px auto;padding:24px;border-radius:16px;background:#1f2c34}
    h1{font-size:1.25rem;margin:0 0 8px}
    p{color:#8696a0;margin:0 0 20px}
    a.btn{display:inline-block;padding:14px 28px;background:#00a884;color:#fff;text-decoration:none;border-radius:999px;font-weight:700}
    .muted{font-size:.85rem;margin-top:16px;color:#8696a0}
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${channel}${published ? "" : " · Under review"}</p>
    <a class="btn" href="${deepLink}" id="open">Open in Videh</a>
    <p class="muted">Don't have the app? Search <strong>Videh Messenger</strong> on Play Store.</p>
  </div>
  <script>
    (function () {
      var deep = ${JSON.stringify(deepLink)};
      var published = ${published ? "true" : "false"};
      if (!published) return;
      try { window.location.href = deep; } catch (e) {}
    })();
  </script>
</body>
</html>`);
  } catch (err) {
    req.log.error({ err, videoId }, "reels go link");
    res.status(500).send("Server error");
  }
});

/** Public video playback with HTTP Range (mobile players need this). */
router.get("/videos/:id/stream", async (req: Request, res: Response) => {
  const videoId = Number(req.params.id);
  if (!videoId) {
    res.status(400).end();
    return;
  }
  try {
    const viewerId = Number(req.query.userId) || getAuthUserId(req) || 0;
    const row = await query(
      `SELECT v.video_url, v.status, v.play_enabled, c.user_id AS channel_owner_id
       FROM reels_videos v
       JOIN reels_channels c ON c.id = v.channel_id
       WHERE v.id = $1`,
      [videoId],
    );
    if (!row.rows.length) {
      res.status(404).end();
      return;
    }
    const stored = row.rows[0] as {
      video_url?: string | null;
      status?: string | null;
      play_enabled?: boolean | null;
      channel_owner_id?: number | null;
    };
    const isOwner = viewerId > 0 && Number(stored.channel_owner_id) === viewerId;
    const isPublic = stored.status === "published" && stored.play_enabled !== false;
    if (!isPublic && !isOwner) {
      res.status(403).end();
      return;
    }
    const uploadsRoot = path.join(apiServerDir, "uploads");
    const { parseMaxHeightQuery, resolveReelsQualityVideoPath, uploadsRelForLocalVideoPath, variantUploadsRel } =
      await import("../lib/reelsVideoVariants");
    const maxHeight = parseMaxHeightQuery(req.query.maxHeight);
    const localPath = await resolveReelsQualityVideoPath(
      uploadsRoot,
      stored.video_url,
      videoId,
      maxHeight,
    );
    if (localPath) {
      const playbackRel = maxHeight
        ? variantUploadsRel(videoId, maxHeight)
        : (uploadsRelForLocalVideoPath(localPath, uploadsRoot) ?? stored.video_url);
      if (cdnDeliveryEnabled() && tryRedirectStoredMediaToCdn(req, res, playbackRel)) return;
      const { serveLocalVideoWithRange } = await import("../lib/reelsVideoStream");
      serveLocalVideoWithRange(req, res, localPath);
      return;
    }
    if (cdnDeliveryEnabled() && tryRedirectStoredMediaToCdn(req, res, stored.video_url)) return;
    if (tryStreamStoredReelsVideo(req, res, stored.video_url, uploadsRoot)) return;
    const external = externalVideoRedirectTarget(req, stored.video_url);
    if (external) {
      res.redirect(external);
      return;
    }
    res.status(404).end();
  } catch (err) {
    req.log.error({ err, videoId }, "reels video stream");
    res.status(500).end();
  }
});

router.get("/channels/:channelId/avatar", async (req: Request, res: Response) => {
  await serveChannelBrandingAsset(req, res, "avatar");
});

router.get("/channels/:channelId/cover", async (req: Request, res: Response) => {
  await serveChannelBrandingAsset(req, res, "cover");
});

router.get("/rules", async (_req: Request, res: Response) => {
  try {
    const config = await getReelsPlatformConfig();
    res.json({ success: true, rules: publicReelsRules(config) });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/handle/check", async (req: Request, res: Response) => {
  const handle = normalizeReelsHandle(String(req.query.handle ?? ""));
  if (!handle) {
    res.status(400).json({ success: false, message: "Username must be 3–30 letters, numbers, or underscore." });
    return;
  }
  try {
    await ensureReelsTables();
    const taken = await query("SELECT 1 FROM reels_channels WHERE LOWER(handle) = $1 LIMIT 1", [handle]);
    res.json({ success: true, available: taken.rows.length === 0, handle });
  } catch (err) {
    req.log.error({ err }, "reels handle check");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/channel", async (req: Request, res: Response) => {
  const { userId, handle, avatarUrl, bio } = req.body as {
    userId?: number; handle?: string; avatarUrl?: string; bio?: string;
  };
  if (!userId) {
    res.status(400).json({ success: false, message: "userId required" });
    return;
  }
  if (!assertSameUser(req, res, userId)) return;
  const normalized = normalizeReelsHandle(String(handle ?? ""));
  if (!normalized) {
    res.status(400).json({ success: false, message: "Invalid username. Use letters, numbers, underscore (3–30 chars)." });
    return;
  }
  try {
    await ensureReelsTables();
    const existing = await query("SELECT id FROM reels_channels WHERE user_id = $1", [userId]);
    if (existing.rows.length > 0) {
      res.status(409).json({ success: false, message: "Reels account already exists." });
      return;
    }
    const taken = await query("SELECT 1 FROM reels_channels WHERE LOWER(handle) = $1", [normalized]);
    if (taken.rows.length > 0) {
      res.status(409).json({ success: false, message: "Username already used." });
      return;
    }
    const inserted = await query(
      `INSERT INTO reels_channels (user_id, handle, avatar_url, bio)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [userId, normalized, avatarUrl?.trim() || null, bio?.trim() || null],
    );
    res.json({
      success: true,
      channel: mapPublicChannelResponse(req, inserted.rows[0] as Record<string, unknown>, userId),
    });
  } catch (err) {
    req.log.error({ err }, "reels create channel");
    res.status(500).json({ success: false, message: "Could not create reels account." });
  }
});

router.get("/channel/me", async (req: Request, res: Response) => {
  const userId = Number(req.query.userId);
  if (!userId) {
    res.status(400).json({ success: false, message: "userId required" });
    return;
  }
  if (!assertSameUser(req, res, userId)) return;
  try {
    await ensureReelsTables();
    const result = await query(
      `SELECT c.*
       FROM reels_channels c
       WHERE c.user_id = $1`,
      [userId],
    );
    if (result.rows.length === 0) {
      res.json({ success: true, channel: null });
      return;
    }
    const channelRow = result.rows[0] as Record<string, unknown>;
    const channelId = Number(channelRow.id);
    const monetization = await evaluateChannelMonetization(channelId);
    const config = await getReelsPlatformConfig();
    const [links, playlists, videoCount] = await Promise.all([
      fetchChannelLinks(channelId),
      fetchChannelPlaylists(channelId, true),
      fetchChannelVideoCount(channelId, true),
    ]);
    res.json({
      success: true,
      channel: { ...mapPublicChannelResponse(req, channelRow, userId), videoCount },
      links,
      playlists,
      monetization,
      rules: publicReelsRules(config),
    });
  } catch (err) {
    req.log.error({ err }, "reels my channel");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.patch("/channel/me", runChannelBrandingUpload, async (req: Request, res: Response) => {
  const userId = Number((req.body as { userId?: string }).userId);
  const displayName = String((req.body as { displayName?: string }).displayName ?? "").trim().slice(0, 80);
  const bio = String((req.body as { bio?: string }).bio ?? "").trim();
  if (!userId) {
    res.status(400).json({ success: false, message: "userId required" });
    return;
  }
  if (!assertSameUser(req, res, userId)) return;
  try {
    await ensureReelsTables();
    const existing = await query("SELECT * FROM reels_channels WHERE user_id = $1", [userId]);
    if (!existing.rows.length) {
      res.status(404).json({ success: false, message: "Create your channel first." });
      return;
    }
    const files = req.files as { avatar?: { filename: string }[]; cover?: { filename: string }[] } | undefined;
    const avatarFile = files?.avatar?.[0];
    const coverFile = files?.cover?.[0];
    const avatarUrl = avatarFile ? `/uploads/reels/${avatarFile.filename}` : undefined;
    const coverUrl = coverFile ? `/uploads/reels/${coverFile.filename}` : undefined;

    const body = req.body as { displayName?: string; bio?: string };
    const sets = ["updated_at = NOW()"];
    const params: unknown[] = [userId];
    let p = 2;
    if (body.displayName !== undefined) {
      sets.push(`display_name = $${p++}`);
      params.push(displayName || null);
    }
    if (body.bio !== undefined) {
      sets.push(`bio = $${p++}`);
      params.push(bio || null);
    }
    if (avatarUrl) {
      sets.push(`avatar_url = $${p++}`);
      params.push(avatarUrl);
      scheduleS3Upload(path.join(reelsUploadsDir, avatarFile!.filename), avatarUrl);
    }
    if (coverUrl) {
      sets.push(`cover_url = $${p++}`);
      params.push(coverUrl);
      scheduleS3Upload(path.join(reelsUploadsDir, coverFile!.filename), coverUrl);
    }
    await query(
      `UPDATE reels_channels SET ${sets.join(", ")} WHERE user_id = $1`,
      params,
    );
    const updated = await query("SELECT * FROM reels_channels WHERE user_id = $1", [userId]);
    res.json({
      success: true,
      channel: mapPublicChannelResponse(req, updated.rows[0] as Record<string, unknown>, userId),
    });
  } catch (err) {
    req.log.error({ err }, "reels update channel");
    res.status(500).json({ success: false, message: "Could not update channel." });
  }
});

router.put("/channel/me/links", async (req: Request, res: Response) => {
  const userId = Number((req.body as { userId?: number }).userId);
  const rawLinks = (req.body as { links?: ChannelLinkInput[] }).links;
  if (!userId) {
    res.status(400).json({ success: false, message: "userId required" });
    return;
  }
  if (!assertSameUser(req, res, userId)) return;
  if (!Array.isArray(rawLinks)) {
    res.status(400).json({ success: false, message: "links array required" });
    return;
  }
  if (rawLinks.length > 20) {
    res.status(400).json({ success: false, message: "Maximum 20 links allowed." });
    return;
  }
  try {
    await ensureReelsTables();
    const existing = await query("SELECT id FROM reels_channels WHERE user_id = $1", [userId]);
    if (!existing.rows.length) {
      res.status(404).json({ success: false, message: "Create your channel first." });
      return;
    }
    const channelId = Number(existing.rows[0].id);
    const normalized: { title: string; url: string }[] = [];
    for (const item of rawLinks) {
      const title = String(item.title ?? "").trim().slice(0, 120);
      const url = normalizeChannelLinkUrl(String(item.url ?? ""));
      if (!title || !url) continue;
      normalized.push({ title, url });
    }
    await query("DELETE FROM reels_channel_links WHERE channel_id = $1", [channelId]);
    for (let i = 0; i < normalized.length; i++) {
      const link = normalized[i];
      await query(
        `INSERT INTO reels_channel_links (channel_id, title, url, sort_order)
         VALUES ($1, $2, $3, $4)`,
        [channelId, link.title, link.url, i],
      );
    }
    const links = await fetchChannelLinks(channelId);
    res.json({ success: true, links });
  } catch (err) {
    req.log.error({ err }, "reels update channel links");
    res.status(500).json({ success: false, message: "Could not update links." });
  }
});

router.post("/channel/me/playlists", async (req: Request, res: Response) => {
  const userId = Number((req.body as { userId?: number }).userId);
  const title = String((req.body as { title?: string }).title ?? "").trim().slice(0, 200);
  const description = String((req.body as { description?: string }).description ?? "").trim().slice(0, 2000);
  const videoIds = (req.body as { videoIds?: number[] }).videoIds ?? [];
  if (!userId) {
    res.status(400).json({ success: false, message: "userId required" });
    return;
  }
  if (!assertSameUser(req, res, userId)) return;
  if (title.length < 1) {
    res.status(400).json({ success: false, message: "Playlist title required." });
    return;
  }
  try {
    await ensureReelsTables();
    const ch = await query("SELECT id FROM reels_channels WHERE user_id = $1", [userId]);
    if (!ch.rows.length) {
      res.status(404).json({ success: false, message: "Create your channel first." });
      return;
    }
    const channelId = Number(ch.rows[0].id);
    const inserted = await query(
      `INSERT INTO reels_playlists (channel_id, title, description)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [channelId, title, description || null],
    );
    const playlistId = Number(inserted.rows[0].id);
    const uniqueVideoIds = [...new Set(videoIds.filter((id) => Number.isFinite(id) && id > 0))].slice(0, 100);
    if (uniqueVideoIds.length > 0) {
      const owned = await query(
        `SELECT id FROM reels_videos
         WHERE channel_id = $1 AND id = ANY($2::int[])`,
        [channelId, uniqueVideoIds],
      );
      let order = 0;
      for (const vid of owned.rows) {
        await query(
          `INSERT INTO reels_playlist_items (playlist_id, video_id, sort_order)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [playlistId, vid.id, order++],
        );
      }
    }
    const playlists = await fetchChannelPlaylists(channelId, true);
    res.json({ success: true, playlists });
  } catch (err) {
    req.log.error({ err }, "reels create playlist");
    res.status(500).json({ success: false, message: "Could not create playlist." });
  }
});

router.delete("/channel/me/playlists/:playlistId", async (req: Request, res: Response) => {
  const userId = Number((req.body as { userId?: number }).userId ?? req.query.userId);
  const playlistId = Number(req.params.playlistId);
  if (!userId) {
    res.status(400).json({ success: false, message: "userId required" });
    return;
  }
  if (!assertSameUser(req, res, userId)) return;
  try {
    await ensureReelsTables();
    const row = await query(
      `SELECT p.id, p.channel_id
       FROM reels_playlists p
       JOIN reels_channels c ON c.id = p.channel_id
       WHERE p.id = $1 AND c.user_id = $2`,
      [playlistId, userId],
    );
    if (!row.rows.length) {
      res.status(404).json({ success: false, message: "Playlist not found." });
      return;
    }
    const channelId = Number(row.rows[0].channel_id);
    await query("DELETE FROM reels_playlists WHERE id = $1", [playlistId]);
    const playlists = await fetchChannelPlaylists(channelId, true);
    res.json({ success: true, playlists });
  } catch (err) {
    req.log.error({ err }, "reels delete playlist");
    res.status(500).json({ success: false, message: "Could not delete playlist." });
  }
});

router.get("/channel/:handle/playlists/:playlistId", async (req: Request, res: Response) => {
  const handle = normalizeReelsHandle(String(req.params.handle ?? ""));
  const playlistId = Number(req.params.playlistId);
  const viewerId = Number(req.query.userId) || getAuthUserId(req) || 0;
  if (!handle || !playlistId) {
    res.status(400).json({ success: false, message: "Invalid request" });
    return;
  }
  try {
    await ensureReelsTables();
    const pl = await query(
      `SELECT p.*, c.handle, c.user_id
       FROM reels_playlists p
       JOIN reels_channels c ON c.id = p.channel_id
       WHERE p.id = $1 AND LOWER(c.handle) = $2`,
      [playlistId, handle],
    );
    if (!pl.rows.length) {
      res.status(404).json({ success: false, message: "Playlist not found" });
      return;
    }
    const playlistRow = pl.rows[0] as Record<string, unknown>;
    const isOwner = viewerId > 0 && Number(playlistRow.user_id) === viewerId;
    const videos = await query(
      `SELECT v.*, c.handle AS channel_handle, c.display_name AS channel_display_name,
              c.avatar_url AS channel_avatar_url, c.updated_at AS channel_updated_at
       FROM reels_playlist_items pi
       JOIN reels_videos v ON v.id = pi.video_id
       JOIN reels_channels c ON c.id = v.channel_id
       WHERE pi.playlist_id = $1
         AND ($2::boolean OR (v.status = 'published' AND v.play_enabled = TRUE))
       ORDER BY pi.sort_order ASC, pi.video_id ASC`,
      [playlistId, isOwner],
    );
    res.json({
      success: true,
      playlist: {
        id: playlistRow.id,
        title: playlistRow.title,
        description: playlistRow.description ?? null,
        videoCount: videos.rows.length,
        createdAt: playlistRow.created_at,
      },
      videos: videos.rows.map((r) => mapVideoRow(r as Record<string, unknown>, req)),
    });
  } catch (err) {
    req.log.error({ err }, "reels playlist detail");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/channel/:handle", async (req: Request, res: Response) => {
  const handle = normalizeReelsHandle(req.params.handle);
  const viewerId = Number(req.query.userId) || getAuthUserId(req) || 0;
  if (!handle) {
    res.status(400).json({ success: false, message: "Invalid handle" });
    return;
  }
  try {
    await ensureReelsTables();
    const ch = await query(
      `SELECT c.*,
              EXISTS(
                SELECT 1 FROM reels_subscriptions s
                WHERE s.channel_id = c.id AND s.subscriber_user_id = $2
              ) AS is_subscribed
       FROM reels_channels c
       WHERE LOWER(c.handle) = $1`,
      [handle, viewerId || null],
    );
    if (ch.rows.length === 0) {
      res.status(404).json({ success: false, message: "Channel not found" });
      return;
    }
    const channelRow = ch.rows[0] as Record<string, unknown>;
    const isOwner = viewerId > 0 && Number(channelRow.user_id) === viewerId;
    const channelId = Number(channelRow.id);
    const [videos, links, playlists, videoCount] = await Promise.all([
      query(
        `SELECT v.*, c.handle AS channel_handle, c.display_name AS channel_display_name,
                c.avatar_url AS channel_avatar_url, c.updated_at AS channel_updated_at
         FROM reels_videos v JOIN reels_channels c ON c.id = v.channel_id
         WHERE v.channel_id = $1
           AND ($2::boolean OR (v.status = 'published' AND v.play_enabled = TRUE))
         ORDER BY v.created_at DESC LIMIT 100`,
        [channelId, isOwner],
      ),
      fetchChannelLinks(channelId),
      fetchChannelPlaylists(channelId, isOwner),
      fetchChannelVideoCount(channelId, isOwner),
    ]);
    const config = await getReelsPlatformConfig();
    const monetization = await evaluateChannelMonetization(channelId);
    res.json({
      success: true,
      channel: { ...mapPublicChannelResponse(req, channelRow, viewerId), videoCount },
      videos: videos.rows.map((r) => mapVideoRow(r as Record<string, unknown>, req)),
      links,
      playlists,
      monetization,
      rules: publicReelsRules(config),
    });
  } catch (err) {
    req.log.error({ err }, "reels channel profile");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/feed", async (req: Request, res: Response) => {
  const viewerId = Number(req.query.userId) || 0;
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 15));
  const cursorAt = String(req.query.cursorAt ?? "").trim();
  const cursorId = Number(req.query.cursorId) || 0;
  const cursor: FeedCursor | null = cursorAt && cursorId > 0
    ? { at: cursorAt, id: cursorId }
    : null;
  try {
    await ensureReelsTables();
    const trendingRows = cursor ? [] : await fetchTrendingReels(viewerId, 10);
    const { videos: rows, nextCursor } = await fetchLatestReelsFeed(viewerId, limit, cursor);
    const videos = rows.map((r) => mapVideoRow(r, req));
    const trending = trendingRows.map((r) => mapVideoRow(r, req));
    const cfg = await getReelsPlatformConfig();
    const feedAdMinGap = cfg.ads.feedAdMinGap ?? cfg.ads.feedAdEveryVideos ?? 2;
    const feedAdMaxGap = cfg.ads.feedAdMaxGap ?? Math.max(feedAdMinGap + 3, 7);
    const feedAdPlacements = cfg.ads.feedAdsEnabled && videos.length > 0
      ? await pickFeedAdPlacementsForBatch(videos.length, feedAdMinGap, feedAdMaxGap)
      : [];
    res.json({
      success: true,
      videos,
      trending,
      nextCursor,
      feedAdPlacements,
      feedAdMinGap,
      feedAdMaxGap,
    });
  } catch (err) {
    req.log.error({ err }, "reels feed");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/hashtags/suggest", async (req: Request, res: Response) => {
  const q = String(req.query.q ?? "").trim();
  const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 10));
  try {
    await ensureReelsTables();
    const hashtags = await fetchHashtagSuggestions(q, limit);
    res.json({ success: true, hashtags });
  } catch (err) {
    req.log.error({ err }, "reels hashtag suggest");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/hashtags/:tag", async (req: Request, res: Response) => {
  const tag = String(req.params.tag ?? "").trim();
  const viewerId = Number(req.query.userId) || 0;
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 30));
  if (!tag || tag.length < 1) {
    res.status(400).json({ success: false, message: "Invalid hashtag" });
    return;
  }
  try {
    await ensureReelsTables();
    const normalized = tag.toLowerCase().replace(/^#/, "");
    const stats = await fetchHashtagStats(normalized);
    const videos = await query(
      `SELECT v.*, c.handle AS channel_handle, c.display_name AS channel_display_name,
              c.avatar_url AS channel_avatar_url, c.updated_at AS channel_updated_at
       FROM reels_videos v JOIN reels_channels c ON c.id = v.channel_id
       WHERE v.status = 'published' AND v.play_enabled = TRUE
         AND EXISTS (
           SELECT 1 FROM unnest(v.hashtags) h WHERE LOWER(BTRIM(h)) = $1
         )
       ORDER BY v.view_count DESC, v.created_at DESC
       LIMIT $2`,
      [normalized, limit],
    );
    res.json({
      success: true,
      hashtag: stats,
      videos: videos.rows.map((r) => mapVideoRow(r as Record<string, unknown>, req)),
    });
  } catch (err) {
    req.log.error({ err }, "reels hashtag feed");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/search", async (req: Request, res: Response) => {
  const q = String(req.query.q ?? "").trim().toLowerCase();
  const viewerId = Number(req.query.userId) || 0;
  if (q.length < 2) {
    res.json({ success: true, channels: [], videos: [] });
    return;
  }
  if (isPhoneLikeQuery(q)) {
    res.json({ success: true, channels: [], videos: [] });
    return;
  }
  try {
    await ensureReelsTables();
    const like = `%${q}%`;
    const [channels, videos] = await Promise.all([
      query(
        `SELECT c.*,
                EXISTS(SELECT 1 FROM reels_subscriptions s WHERE s.channel_id = c.id AND s.subscriber_user_id = $2) AS is_subscribed
         FROM reels_channels c
         WHERE LOWER(c.handle) LIKE $1
         ORDER BY c.subscriber_count DESC LIMIT 20`,
        [like, viewerId || null],
      ),
      query(
        `SELECT v.*, c.handle AS channel_handle, c.display_name AS channel_display_name,
                c.avatar_url AS channel_avatar_url, c.updated_at AS channel_updated_at
         FROM reels_videos v JOIN reels_channels c ON c.id = v.channel_id
         WHERE v.status = 'published' AND v.play_enabled = TRUE
           AND (LOWER(v.title) LIKE $1
            OR LOWER(COALESCE(v.description, '')) LIKE $1
            OR EXISTS (SELECT 1 FROM unnest(v.hashtags) h WHERE LOWER(h) LIKE $1))
         ORDER BY v.view_count DESC LIMIT 30`,
        [like],
      ),
    ]);
    res.json({
      success: true,
      channels: channels.rows.map((r) => mapPublicChannelResponse(req, r as Record<string, unknown>, viewerId)),
      videos: videos.rows.map((r) => mapVideoRow(r as Record<string, unknown>, req)),
    });
  } catch (err) {
    req.log.error({ err }, "reels search");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/videos", runReelsUpload, async (req: Request, res: Response) => {
  const userId = Number((req.body as { userId?: string }).userId);
  const title = String((req.body as { title?: string }).title ?? "").trim();
  const description = String((req.body as { description?: string }).description ?? "").trim();
  const durationSeconds = Number((req.body as { durationSeconds?: string }).durationSeconds) || 0;
  const hashtags = parseHashtags((req.body as { hashtags?: string }).hashtags);
  if (!userId) {
    res.status(400).json({ success: false, message: "userId required" });
    return;
  }
  if (!assertSameUser(req, res, userId)) return;
  if (title.length < 2) {
    res.status(400).json({ success: false, message: "Title is required." });
    return;
  }
  if (durationSeconds > MAX_REELS_VIDEO_SECONDS) {
    res.status(400).json({ success: false, message: "Video is too long (max 4 hours)." });
    return;
  }
  const files = req.files as { video?: { filename: string }[]; thumbnail?: { filename: string }[] } | undefined;
  const videoFile = files?.video?.[0];
  if (!videoFile) {
    res.status(400).json({ success: false, message: "Video file required." });
    return;
  }
  try {
    await ensureReelsTables();
    const ch = await query("SELECT id FROM reels_channels WHERE user_id = $1", [userId]);
    if (ch.rows.length === 0) {
      res.status(403).json({ success: false, message: "Create your reels account first." });
      return;
    }
    const combinedText = [title, description, ...hashtags.map((h) => `#${h}`)].join(" ");
    const quickText = scanReelsText(combinedText);
    if (quickText.blocked) {
      fs.unlinkSync(path.join(reelsUploadsDir, videoFile.filename));
      if (files?.thumbnail?.[0]) fs.unlinkSync(path.join(reelsUploadsDir, files.thumbnail[0].filename));
      res.status(403).json({ success: false, message: quickText.reason ?? "Sexual or nudity content is not allowed." });
      return;
    }

    const videoUrl = `/uploads/reels/${videoFile.filename}`;
    const videoPath = path.join(reelsUploadsDir, videoFile.filename);
    const thumbFile = files?.thumbnail?.[0];
    let thumbnailUrl = thumbFile ? `/uploads/reels/${thumbFile.filename}` : null;
    let thumbPath = thumbFile ? path.join(reelsUploadsDir, thumbFile.filename) : null;

    if (!thumbFile) {
      const autoName = `thumb_auto_upload_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.jpg`;
      const autoPath = path.join(reelsUploadsDir, autoName);
      const { extractVideoFrameToJpeg } = await import("../lib/reelsAutoThumbnail");
      const seek = durationSeconds > 10 ? Math.min(5, Math.floor(durationSeconds * 0.1)) : 1;
      if (await extractVideoFrameToJpeg(videoPath, autoPath, seek)) {
        thumbnailUrl = `/uploads/reels/${autoName}`;
        thumbPath = autoPath;
      }
    }

    const inserted = await query(
      `INSERT INTO reels_videos (
         channel_id, title, description, hashtags, video_url, thumbnail_url, duration_seconds,
         status, play_enabled, moderation_status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending_review', FALSE, 'pending_scan') RETURNING *`,
      [ch.rows[0].id, title.slice(0, 200), description || null, hashtags, videoUrl, thumbnailUrl, durationSeconds],
    );
    const row = inserted.rows[0] as Record<string, unknown>;
    const videoId = Number(row.id);
    const channel = await query("SELECT handle, avatar_url, updated_at FROM reels_channels WHERE id = $1", [row.channel_id]);
    const chRow = channel.rows[0] as Record<string, unknown> | undefined;
    const channelId = Number(row.channel_id);
    const handle = String(chRow?.handle ?? "");

    const modResult = await moderateReelsUpload({
      videoId,
      title,
      description,
      hashtags,
      thumbnailPath: thumbPath,
      thumbnailUrl,
      videoPublicUrl: videoUrl,
      durationSeconds,
    });
    await applyVideoModerationResult(videoId, modResult);

    if (modResult.action === "reject") {
      res.status(403).json({
        success: false,
        message: modResult.reason ?? "Video blocked: nudity or sexual content detected.",
        moderationStatus: "rejected",
      });
      return;
    }

    if (modResult.action === "approve") {
      void notifySubscribersNewVideo(channelId, videoId, title, handle);
      void evaluateChannelMonetization(channelId);
    }

    scheduleS3Upload(videoPath, videoUrl);
    if (thumbPath && thumbnailUrl) scheduleS3Upload(thumbPath, thumbnailUrl);

    const refreshed = await query("SELECT * FROM reels_videos WHERE id = $1", [videoId]);
    const finalRow = refreshed.rows[0] as Record<string, unknown>;
    res.json({
      success: true,
      pending: modResult.action === "pending",
      message: modResult.action === "pending"
        ? (modResult.reason ?? "Video is under safety review. It will go public when approved.")
        : undefined,
      video: mapVideoRow({
        ...finalRow,
        channel_handle: chRow?.handle,
        channel_avatar_url: chRow?.avatar_url,
        channel_updated_at: chRow?.updated_at,
      }, req),
    });
  } catch (err) {
    req.log.error({ err }, "reels post video");
    res.status(500).json({ success: false, message: "Could not post video." });
  }
});

router.get("/videos/:videoId", async (req: Request, res: Response) => {
  const videoId = Number(req.params.videoId);
  const viewerId = Number(req.query.userId) || 0;
  if (!videoId) {
    res.status(400).json({ success: false, message: "Invalid video" });
    return;
  }
  try {
    await ensureReelsTables();
    const result = await query(
      `SELECT v.*, c.handle AS channel_handle, c.display_name AS channel_display_name,
              c.avatar_url AS channel_avatar_url, c.updated_at AS channel_updated_at,
              c.user_id AS channel_owner_id, r.reaction AS my_reaction
       FROM reels_videos v
       JOIN reels_channels c ON c.id = v.channel_id
       LEFT JOIN reels_video_reactions r ON r.video_id = v.id AND r.user_id = $2
       WHERE v.id = $1`,
      [videoId, viewerId || null],
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: "Video not found" });
      return;
    }
    const row = result.rows[0] as Record<string, unknown>;
    const isOwner = viewerId > 0 && Number(row.channel_owner_id) === viewerId;
    const isPublic = row.status === "published" && row.play_enabled !== false;
    if (!isPublic && !isOwner) {
      res.status(404).json({ success: false, message: "Video not found" });
      return;
    }
    const config = await getReelsPlatformConfig();
    const play = canPlayVideo(row, config);
    const uploadsRoot = path.join(apiServerDir, "uploads");
    const { probeVideoSourceHeight } = await import("../lib/reelsVideoVariants");
    const sourceHeight = await probeVideoSourceHeight(uploadsRoot, row.video_url);
    res.json({
      success: true,
      video: { ...mapVideoRow(row, req), sourceHeight },
      playAllowed: play.allowed,
      playBlockReasons: play.reasons,
    });
  } catch (err) {
    req.log.error({ err }, "reels get video");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/videos/:videoId/view", async (req: Request, res: Response) => {
  const videoId = Number(req.params.videoId);
  const { userId, watchedSeconds } = req.body as { userId?: number; watchedSeconds?: number };
  const secs = Math.min(3600, Math.max(0, Math.round(Number(watchedSeconds) || 0)));
  if (!videoId) {
    res.status(400).json({ success: false, message: "Invalid video" });
    return;
  }
  if (userId && !assertSameUser(req, res, userId)) return;
  try {
    await ensureReelsTables();
    const config = await getReelsPlatformConfig();
    if (secs < config.playButton.minWatchSecondsToCountView) {
      await recordViewSession(videoId, userId ?? null, secs, false);
      res.json({ success: true, counted: false, reason: "min_watch_not_met" });
      return;
    }
    const meta = await query(
      `SELECT v.channel_id FROM reels_videos v WHERE v.id = $1`,
      [videoId],
    );
    const channelId = Number(meta.rows[0]?.channel_id);
    const fraud = await checkViewFraud(videoId, channelId, userId ?? null, secs, config);
    await recordViewSession(videoId, userId ?? null, secs, fraud.counted);
    if (!fraud.counted) {
      res.json({ success: true, counted: false, reason: fraud.reason });
      return;
    }
    await query(`UPDATE reels_videos SET view_count = view_count + 1 WHERE id = $1`, [videoId]);
    await query(
      `UPDATE reels_channels c SET
         total_views = total_views + 1,
         total_view_hours = total_view_hours + ($2::numeric / 3600.0)
       FROM reels_videos v
       WHERE v.id = $1 AND c.id = v.channel_id`,
      [videoId, secs],
    );
    res.json({ success: true, counted: true });
  } catch (err) {
    req.log.error({ err }, "reels view");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/videos/:videoId/react", async (req: Request, res: Response) => {
  const videoId = Number(req.params.videoId);
  const { userId, reaction } = req.body as { userId?: number; reaction?: string };
  if (!userId || !assertSameUser(req, res, userId)) return;
  if (!videoId || !["like", "dislike"].includes(String(reaction))) {
    res.status(400).json({ success: false, message: "Invalid reaction" });
    return;
  }
  try {
    await ensureReelsTables();
    const prev = await query(
      "SELECT reaction FROM reels_video_reactions WHERE user_id = $1 AND video_id = $2",
      [userId, videoId],
    );
    const prevReaction = prev.rows[0]?.reaction as string | undefined;
    await query(
      `INSERT INTO reels_video_reactions (user_id, video_id, reaction)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, video_id) DO UPDATE SET reaction = EXCLUDED.reaction`,
      [userId, videoId, reaction],
    );
    if (prevReaction !== reaction) {
      if (prevReaction === "like") {
        await query("UPDATE reels_videos SET like_count = GREATEST(0, like_count - 1) WHERE id = $1", [videoId]);
      } else if (prevReaction === "dislike") {
        await query("UPDATE reels_videos SET dislike_count = GREATEST(0, dislike_count - 1) WHERE id = $1", [videoId]);
      }
      if (reaction === "like") {
        await query("UPDATE reels_videos SET like_count = like_count + 1 WHERE id = $1", [videoId]);
        await query(
          `UPDATE reels_channels c SET total_likes = total_likes + 1
           FROM reels_videos v WHERE v.id = $1 AND c.id = v.channel_id`,
          [videoId],
        );
      } else {
        await query("UPDATE reels_videos SET dislike_count = dislike_count + 1 WHERE id = $1", [videoId]);
      }
    }
    res.json({ success: true, reaction });
  } catch (err) {
    req.log.error({ err }, "reels react");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

const REELS_COMMENT_SELECT = `
  c.id, c.content, c.created_at, c.parent_id, c.like_count,
  rc.handle AS channel_handle, rc.avatar_url,
  (SELECT COUNT(*)::int FROM reels_video_comments r WHERE r.parent_id = c.id) AS reply_count,
  cr.reaction AS my_reaction
`;

router.get("/videos/:videoId/comments", async (req: Request, res: Response) => {
  const videoId = Number(req.params.videoId);
  const userId = Number(req.query.userId ?? 0) || null;
  const sort = String(req.query.sort ?? "top") === "newest" ? "newest" : "top";
  try {
    await ensureReelsTables();
    const orderBy = sort === "newest"
      ? "c.created_at DESC"
      : "c.like_count DESC, c.created_at DESC";
    const result = await query(
      `SELECT ${REELS_COMMENT_SELECT}
       FROM reels_video_comments c
       LEFT JOIN reels_channels rc ON rc.user_id = c.user_id
       LEFT JOIN reels_video_comment_likes cr
         ON cr.comment_id = c.id AND cr.user_id = $2
       WHERE c.video_id = $1 AND c.parent_id IS NULL
       ORDER BY ${orderBy}
       LIMIT 100`,
      [videoId, userId],
    );
    res.json({
      success: true,
      comments: result.rows.map((r) => mapPublicReelsComment(r as Record<string, unknown>)),
    });
  } catch (err) {
    req.log.error({ err }, "reels comments list");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/videos/:videoId/comments/:commentId/replies", async (req: Request, res: Response) => {
  const videoId = Number(req.params.videoId);
  const commentId = Number(req.params.commentId);
  const userId = Number(req.query.userId ?? 0) || null;
  try {
    await ensureReelsTables();
    const result = await query(
      `SELECT ${REELS_COMMENT_SELECT}
       FROM reels_video_comments c
       LEFT JOIN reels_channels rc ON rc.user_id = c.user_id
       LEFT JOIN reels_video_comment_likes cr
         ON cr.comment_id = c.id AND cr.user_id = $3
       WHERE c.video_id = $1 AND c.parent_id = $2
       ORDER BY c.created_at ASC
       LIMIT 50`,
      [videoId, commentId, userId],
    );
    res.json({
      success: true,
      replies: result.rows.map((r) => mapPublicReelsComment(r as Record<string, unknown>)),
    });
  } catch (err) {
    req.log.error({ err }, "reels comment replies");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/videos/:videoId/comments", async (req: Request, res: Response) => {
  const videoId = Number(req.params.videoId);
  const { userId, content, parentId } = req.body as {
    userId?: number;
    content?: string;
    parentId?: number | null;
  };
  const text = String(content ?? "").trim();
  if (!userId || !assertSameUser(req, res, userId)) return;
  if (!text) {
    res.status(400).json({ success: false, message: "Comment required" });
    return;
  }
  try {
    await ensureReelsTables();
    const meta = await query(`SELECT channel_id FROM reels_videos WHERE id = $1`, [videoId]);
    const channelId = Number(meta.rows[0]?.channel_id);
    let replyParentId: number | null = null;
    if (parentId != null && Number(parentId) > 0) {
      const parent = await query(
        `SELECT id, parent_id FROM reels_video_comments WHERE id = $1 AND video_id = $2`,
        [Number(parentId), videoId],
      );
      if (!parent.rows[0]) {
        res.status(404).json({ success: false, message: "Parent comment not found" });
        return;
      }
      replyParentId = parent.rows[0].parent_id != null
        ? Number(parent.rows[0].parent_id)
        : Number(parent.rows[0].id);
    }
    const fraud = await checkCommentFraud(videoId, channelId, userId, text);
    if (!fraud.allowed) {
      res.status(429).json({ success: false, message: "Comment blocked — suspected spam.", reason: fraud.reason });
      return;
    }
    const inserted = await query(
      `INSERT INTO reels_video_comments (video_id, user_id, content, parent_id)
       VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
      [videoId, userId, text.slice(0, 2000), replyParentId],
    );
    await query("UPDATE reels_videos SET comment_count = comment_count + 1 WHERE id = $1", [videoId]);
    await query(
      `UPDATE reels_channels SET total_comments = total_comments + 1 WHERE id = $1`,
      [channelId],
    );
    res.json({ success: true, comment: inserted.rows[0] });
  } catch (err) {
    req.log.error({ err }, "reels comment");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/comments/:commentId/react", async (req: Request, res: Response) => {
  const commentId = Number(req.params.commentId);
  const { userId, reaction } = req.body as { userId?: number; reaction?: string };
  if (!userId || !assertSameUser(req, res, userId)) return;
  if (!commentId || !["like", "dislike"].includes(String(reaction))) {
    res.status(400).json({ success: false, message: "Invalid reaction" });
    return;
  }
  try {
    await ensureReelsTables();
    const row = await query(
      `SELECT id FROM reels_video_comments WHERE id = $1`,
      [commentId],
    );
    if (!row.rows[0]) {
      res.status(404).json({ success: false, message: "Comment not found" });
      return;
    }
    const prev = await query(
      "SELECT reaction FROM reels_video_comment_likes WHERE user_id = $1 AND comment_id = $2",
      [userId, commentId],
    );
    const prevReaction = prev.rows[0]?.reaction as string | undefined;
    if (prevReaction === reaction) {
      await query(
        "DELETE FROM reels_video_comment_likes WHERE user_id = $1 AND comment_id = $2",
        [userId, commentId],
      );
      if (reaction === "like") {
        await query(
          "UPDATE reels_video_comments SET like_count = GREATEST(0, like_count - 1) WHERE id = $1",
          [commentId],
        );
      }
      res.json({ success: true, reaction: null });
      return;
    }
    await query(
      `INSERT INTO reels_video_comment_likes (user_id, comment_id, reaction)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, comment_id) DO UPDATE SET reaction = EXCLUDED.reaction`,
      [userId, commentId, reaction],
    );
    if (prevReaction === "like") {
      await query(
        "UPDATE reels_video_comments SET like_count = GREATEST(0, like_count - 1) WHERE id = $1",
        [commentId],
      );
    }
    if (reaction === "like") {
      await query(
        "UPDATE reels_video_comments SET like_count = like_count + 1 WHERE id = $1",
        [commentId],
      );
    }
    res.json({ success: true, reaction });
  } catch (err) {
    req.log.error({ err }, "reels comment react");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/subscribe/:channelId", async (req: Request, res: Response) => {
  const channelId = Number(req.params.channelId);
  const { userId } = req.body as { userId?: number };
  if (!userId || !assertSameUser(req, res, userId)) return;
  try {
    await ensureReelsTables();
    const own = await query("SELECT user_id FROM reels_channels WHERE id = $1", [channelId]);
    if (own.rows[0]?.user_id === userId) {
      res.status(400).json({ success: false, message: "Cannot subscribe to yourself." });
      return;
    }
    const fraud = await checkSubscribeFraud(channelId, userId);
    if (!fraud.allowed) {
      res.status(429).json({ success: false, message: "Subscribe blocked — suspicious activity.", reason: fraud.reason });
      return;
    }
    await query(
      `INSERT INTO reels_subscriptions (subscriber_user_id, channel_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [userId, channelId],
    );
    await query(
      `UPDATE reels_channels SET subscriber_count = (
         SELECT COUNT(*)::int FROM reels_subscriptions WHERE channel_id = $1
       ) WHERE id = $1`,
      [channelId],
    );
    res.json({ success: true, subscribed: true });
  } catch (err) {
    req.log.error({ err }, "reels subscribe");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/videos/:videoId/share", async (req: Request, res: Response) => {
  const videoId = Number(req.params.videoId);
  const { userId } = req.body as { userId?: number };
  if (!videoId) {
    res.status(400).json({ success: false, message: "Invalid video" });
    return;
  }
  if (userId && !assertSameUser(req, res, userId)) return;
  try {
    await ensureReelsTables();
    await query(`INSERT INTO reels_video_shares (video_id, user_id) VALUES ($1, $2)`, [videoId, userId ?? null]);
    await query(`UPDATE reels_videos SET share_count = share_count + 1 WHERE id = $1`, [videoId]);
    await query(
      `UPDATE reels_channels c SET total_shares = total_shares + 1
       FROM reels_videos v WHERE v.id = $1 AND c.id = v.channel_id`,
      [videoId],
    );
    res.json({ success: true, shareUrl: buildReelsVideoShareUrl(videoId) });
  } catch (err) {
    req.log.error({ err }, "reels share");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.delete("/videos/:videoId", async (req: Request, res: Response) => {
  const videoId = Number(req.params.videoId);
  const userId = Number(req.query.userId) || Number((req.body as { userId?: number }).userId);
  if (!videoId) {
    res.status(400).json({ success: false, message: "Invalid video" });
    return;
  }
  if (!userId || !assertSameUser(req, res, userId)) return;
  try {
    await ensureReelsTables();
    const owner = await query(
      `SELECT c.user_id FROM reels_videos v
       JOIN reels_channels c ON c.id = v.channel_id
       WHERE v.id = $1`,
      [videoId],
    );
    if (!owner.rows.length) {
      res.status(404).json({ success: false, message: "Video not found" });
      return;
    }
    if (Number(owner.rows[0].user_id) !== userId) {
      res.status(403).json({ success: false, message: "Only your own videos can be deleted." });
      return;
    }
    const uploadsRoot = path.join(apiServerDir, "uploads");
    const deleted = await permanentlyDeleteReelsVideo(videoId, uploadsRoot);
    if (!deleted) {
      res.status(404).json({ success: false, message: "Video not found" });
      return;
    }
    res.json({ success: true, message: "Video permanently deleted." });
  } catch (err) {
    req.log.error({ err, videoId }, "reels delete video");
    res.status(500).json({ success: false, message: "Could not delete video." });
  }
});

router.delete("/subscribe/:channelId", async (req: Request, res: Response) => {
  const channelId = Number(req.params.channelId);
  const userId = Number(req.query.userId);
  if (!userId || !assertSameUser(req, res, userId)) return;
  try {
    await ensureReelsTables();
    await query(
      "DELETE FROM reels_subscriptions WHERE subscriber_user_id = $1 AND channel_id = $2",
      [userId, channelId],
    );
    await query(
      `UPDATE reels_channels SET subscriber_count = (
         SELECT COUNT(*)::int FROM reels_subscriptions WHERE channel_id = $1
       ) WHERE id = $1`,
      [channelId],
    );
    res.json({ success: true, subscribed: false });
  } catch (err) {
    req.log.error({ err }, "reels unsubscribe");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/** Video ad breaks before / during playback. */
router.get("/videos/:videoId/ad-breaks", async (req: Request, res: Response) => {
  const videoId = Number(req.params.videoId);
  const viewerId = Number(req.query.userId) || getAuthUserId(req) || 0;
  if (!videoId) {
    res.status(400).json({ success: false });
    return;
  }
  try {
    await ensureReelsTables();
    const row = await query(
      `SELECT v.duration_seconds, c.user_id AS channel_owner_id
       FROM reels_videos v
       JOIN reels_channels c ON c.id = v.channel_id
       WHERE v.id = $1`,
      [videoId],
    );
    if (!row.rows.length) {
      res.status(404).json({ success: false });
      return;
    }
    const v = row.rows[0] as { duration_seconds?: number; channel_owner_id?: number };
    const breaks = await resolveReelsAdBreaks({
      contentVideoId: videoId,
      contentDurationSeconds: Number(v.duration_seconds) || 0,
      viewerUserId: viewerId,
      channelOwnerUserId: Number(v.channel_owner_id) || null,
    });
    res.json({ success: true, ...breaks });
  } catch (err) {
    req.log.error({ err, videoId }, "reels ad-breaks");
    res.status(500).json({ success: false });
  }
});

router.post("/ads/click", async (req: Request, res: Response) => {
  const body = req.body as {
    creativeId?: number;
    userId?: number;
    placement?: string;
    clickTarget?: string;
  };
  const creativeId = Number(body.creativeId);
  if (!creativeId) {
    res.status(400).json({ success: false });
    return;
  }
  const userId = Number(body.userId) || getAuthUserId(req) || 0;
  const clickTarget = ["cta", "play_store", "app_store", "destination"].includes(String(body.clickTarget))
    ? (body.clickTarget as "cta" | "play_store" | "app_store" | "destination")
    : "cta";
  try {
    const geo = await resolveViewerGeoFromRequest(req);
    const result = await recordReelsAdClick({
      creativeId,
      viewerUserId: userId,
      placement: String(body.placement ?? "feed_instream"),
      clickTarget,
      viewerCity: geo.city,
      viewerState: geo.state,
      viewerCountry: geo.country,
    });
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "reels ad click");
    res.status(500).json({ success: false });
  }
});

router.post("/ads/impression", async (req: Request, res: Response) => {
  const body = req.body as {
    creativeId?: number;
    contentVideoId?: number;
    userId?: number;
    placement?: string;
    watchedSeconds?: number;
    skipped?: boolean;
    completed?: boolean;
  };
  const creativeId = Number(body.creativeId);
  const contentVideoId = Number(body.contentVideoId);
  const placement = String(body.placement ?? "pre_roll");
  if (!creativeId || (placement !== "feed_instream" && !contentVideoId)) {
    res.status(400).json({ success: false });
    return;
  }
  const userId = Number(body.userId) || getAuthUserId(req) || 0;
  try {
    const geo = await resolveViewerGeoFromRequest(req);
    await recordReelsAdImpression({
      creativeId,
      contentVideoId,
      viewerUserId: userId,
      placement,
      watchedSeconds: Math.max(0, Number(body.watchedSeconds) || 0),
      skipped: Boolean(body.skipped),
      completed: Boolean(body.completed),
      viewerCity: geo.city,
      viewerState: geo.state,
      viewerCountry: geo.country,
    });
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "reels ad impression");
    res.status(500).json({ success: false });
  }
});

export default router;

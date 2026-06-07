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

/** Uploaded videos stream through API (Range support); external URLs pass through. */
function resolveVideoPlaybackUrl(req: Request, storedUrl: unknown, videoId: unknown): string {
  const raw = String(storedUrl ?? "").trim();
  if (!raw) return "";
  if (!uploadsRelPathFromStoredUrl(raw) && /^https?:\/\//i.test(raw)) return raw;
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
    }
    res.status(404).end();
  } catch (err) {
    req.log.error({ err, videoId }, "reels video thumbnail");
    res.status(500).end();
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
    const monetization = await evaluateChannelMonetization(Number(channelRow.id));
    const config = await getReelsPlatformConfig();
    res.json({
      success: true,
      channel: mapPublicChannelResponse(req, channelRow, userId),
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
    }
    if (coverUrl) {
      sets.push(`cover_url = $${p++}`);
      params.push(coverUrl);
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
    const videos = await query(
      `SELECT v.*, c.handle AS channel_handle, c.display_name AS channel_display_name,
              c.avatar_url AS channel_avatar_url, c.updated_at AS channel_updated_at
       FROM reels_videos v JOIN reels_channels c ON c.id = v.channel_id
       WHERE v.channel_id = $1
         AND ($2::boolean OR (v.status = 'published' AND v.play_enabled = TRUE))
       ORDER BY v.created_at DESC LIMIT 100`,
      [channelRow.id, isOwner],
    );
    const config = await getReelsPlatformConfig();
    const monetization = await evaluateChannelMonetization(Number(channelRow.id));
    res.json({
      success: true,
      channel: mapPublicChannelResponse(req, channelRow, viewerId),
      videos: videos.rows.map((r) => mapVideoRow(r as Record<string, unknown>, req)),
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
    res.json({ success: true, videos, trending, nextCursor });
  } catch (err) {
    req.log.error({ err }, "reels feed");
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
    res.json({
      success: true,
      video: mapVideoRow(row, req),
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

router.get("/videos/:videoId/comments", async (req: Request, res: Response) => {
  const videoId = Number(req.params.videoId);
  try {
    await ensureReelsTables();
    const result = await query(
      `SELECT c.id, c.content, c.created_at, rc.handle AS channel_handle
       FROM reels_video_comments c
       LEFT JOIN reels_channels rc ON rc.user_id = c.user_id
       WHERE c.video_id = $1 ORDER BY c.created_at DESC LIMIT 100`,
      [videoId],
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

router.post("/videos/:videoId/comments", async (req: Request, res: Response) => {
  const videoId = Number(req.params.videoId);
  const { userId, content } = req.body as { userId?: number; content?: string };
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
    const fraud = await checkCommentFraud(videoId, channelId, userId, text);
    if (!fraud.allowed) {
      res.status(429).json({ success: false, message: "Comment blocked — suspected spam.", reason: fraud.reason });
      return;
    }
    const inserted = await query(
      `INSERT INTO reels_video_comments (video_id, user_id, content) VALUES ($1, $2, $3) RETURNING id, created_at`,
      [videoId, userId, text.slice(0, 2000)],
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
    res.json({ success: true });
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

export default router;

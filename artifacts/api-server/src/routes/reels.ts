import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { query } from "../lib/db";
import { assertSameUser, getAuthUserId } from "../lib/auth";
import { publicMediaUrl } from "../lib/mediaStorage";
import {
  ensureReelsTables,
  MAX_REELS_VIDEO_SECONDS,
  normalizeReelsHandle,
} from "../lib/reelsSchema";
import { getReelsPlatformConfig, publicReelsRules } from "../lib/reelsConfig";
import { checkCommentFraud, checkSubscribeFraud, checkViewFraud, recordViewSession } from "../lib/reelsFraud";
import { fetchRankedReelsFeed } from "../lib/reelsFeed";
import { canPlayVideo, evaluateChannelMonetization } from "../lib/reelsMonetization";
import { notifySubscribersNewVideo } from "../lib/reelsNotifications";
import {
  applyVideoModerationResult,
  moderateReelsUpload,
  scanReelsText,
} from "../lib/reelsContentModeration";

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
      const ext = path.extname(file.originalname || "") || ".mp4";
      const safeExt = ext.replace(/[^.\w]/g, "") || ".mp4";
      cb(null, `${Date.now()}_${crypto.randomBytes(6).toString("hex")}${safeExt}`);
    },
  }),
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const isVideo = /^video\//.test(file.mimetype) || file.fieldname === "video";
    const isImage = /^image\//.test(file.mimetype) || file.fieldname === "thumbnail";
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
      ? "Video is too large (max 500 MB)."
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

function mapChannelRow(row: Record<string, unknown>, viewerId?: number) {
  return {
    id: row.id,
    userId: row.user_id,
    handle: row.handle,
    avatarUrl: row.avatar_url ?? null,
    bio: row.bio ?? null,
    subscriberCount: Number(row.subscriber_count ?? 0),
    totalViews: Number(row.total_views ?? 0),
    totalViewHours: Number(row.total_view_hours ?? 0),
    totalLikes: Number(row.total_likes ?? 0),
    totalComments: Number(row.total_comments ?? 0),
    totalShares: Number(row.total_shares ?? 0),
    fraudScore: Number(row.fraud_score ?? 0),
    monetizationEligible: Boolean(row.monetization_eligible),
    monetizationStatus: row.monetization_status ?? "not_eligible",
    isSubscribed: Boolean(row.is_subscribed),
    ownerName: row.owner_name ?? null,
    createdAt: row.created_at,
  };
}

function mapVideoRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    channelId: row.channel_id,
    title: row.title,
    description: row.description ?? "",
    hashtags: row.hashtags ?? [],
    videoUrl: row.video_url,
    thumbnailUrl: row.thumbnail_url ?? null,
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
    channelAvatarUrl: row.channel_avatar_url ?? null,
    myReaction: row.my_reaction ?? null,
    createdAt: row.created_at,
  };
}

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
    res.json({ success: true, channel: mapChannelRow(inserted.rows[0] as Record<string, unknown>) });
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
      `SELECT c.*, u.name AS owner_name
       FROM reels_channels c JOIN users u ON u.id = c.user_id
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
      channel: mapChannelRow(channelRow, userId),
      monetization,
      rules: publicReelsRules(config),
    });
  } catch (err) {
    req.log.error({ err }, "reels my channel");
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
      `SELECT c.*, u.name AS owner_name,
              EXISTS(
                SELECT 1 FROM reels_subscriptions s
                WHERE s.channel_id = c.id AND s.subscriber_user_id = $2
              ) AS is_subscribed
       FROM reels_channels c JOIN users u ON u.id = c.user_id
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
      `SELECT v.*, c.handle AS channel_handle, c.avatar_url AS channel_avatar_url
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
      channel: mapChannelRow(channelRow, viewerId),
      videos: videos.rows.map((r) => mapVideoRow(r as Record<string, unknown>)),
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
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const cursor = Number(req.query.cursor) || 0;
  try {
    await ensureReelsTables();
    const { videos: rows, nextCursor } = await fetchRankedReelsFeed(
      viewerId,
      limit,
      cursor > 0 ? cursor : null,
    );
    const videos = rows.map((r) => mapVideoRow(r));
    res.json({ success: true, videos, nextCursor });
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
  try {
    await ensureReelsTables();
    const like = `%${q}%`;
    const [channels, videos] = await Promise.all([
      query(
        `SELECT c.*, u.name AS owner_name,
                EXISTS(SELECT 1 FROM reels_subscriptions s WHERE s.channel_id = c.id AND s.subscriber_user_id = $2) AS is_subscribed
         FROM reels_channels c JOIN users u ON u.id = c.user_id
         WHERE LOWER(c.handle) LIKE $1 OR LOWER(COALESCE(u.name, '')) LIKE $1
         ORDER BY c.subscriber_count DESC LIMIT 20`,
        [like, viewerId || null],
      ),
      query(
        `SELECT v.*, c.handle AS channel_handle, c.avatar_url AS channel_avatar_url
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
      channels: channels.rows.map((r) => mapChannelRow(r as Record<string, unknown>, viewerId)),
      videos: videos.rows.map((r) => mapVideoRow(r as Record<string, unknown>)),
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
    res.status(400).json({ success: false, message: "Video must be 5 minutes or shorter." });
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

    const videoUrl = publicMediaUrl(req, `/uploads/reels/${videoFile.filename}`);
    const thumbFile = files?.thumbnail?.[0];
    const thumbnailUrl = thumbFile
      ? publicMediaUrl(req, `/uploads/reels/${thumbFile.filename}`)
      : null;
    const thumbPath = thumbFile ? path.join(reelsUploadsDir, thumbFile.filename) : null;

    const inserted = await query(
      `INSERT INTO reels_videos (
         channel_id, title, description, hashtags, video_url, thumbnail_url, duration_seconds,
         status, play_enabled, moderation_status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending_review', FALSE, 'pending_scan') RETURNING *`,
      [ch.rows[0].id, title.slice(0, 200), description || null, hashtags, videoUrl, thumbnailUrl, durationSeconds],
    );
    const row = inserted.rows[0] as Record<string, unknown>;
    const videoId = Number(row.id);
    const channel = await query("SELECT handle, avatar_url FROM reels_channels WHERE id = $1", [row.channel_id]);
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
      }),
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
      `SELECT v.*, c.handle AS channel_handle, c.avatar_url AS channel_avatar_url,
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
      video: mapVideoRow(row),
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
      `SELECT c.id, c.content, c.created_at, u.id AS user_id, u.name AS user_name, u.avatar_url
       FROM reels_video_comments c JOIN users u ON u.id = c.user_id
       WHERE c.video_id = $1 ORDER BY c.created_at DESC LIMIT 100`,
      [videoId],
    );
    res.json({ success: true, comments: result.rows });
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

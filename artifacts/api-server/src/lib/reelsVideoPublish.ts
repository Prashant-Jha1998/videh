import type { Request } from "express";
import path from "node:path";
import { query } from "./db";
import { generateReelsVideoShareSlug, ensureReelsShareSlugs } from "./reelsShareUrl";
import { resolveStoredMediaUrl } from "./mediaStorage";
import {
  applyVideoModerationResult,
  moderateReelsUpload,
  type ModerationScanResult,
} from "./reelsContentModeration";
import { evaluateChannelMonetization } from "./reelsMonetization";
import { notifySubscribersNewVideo } from "./reelsNotifications";
import { scheduleS3Upload, uploadLocalFileToS3 } from "./s3Storage";
import { auditFromRequest, linkS3UploadEntity } from "./s3MediaAudit";

export type VideoEditorMetadata = {
  filter?: string;
  caption?: string;
  textOverlays?: Array<{
    id: string;
    text: string;
    x: number;
    y: number;
    color?: string;
    fontSize?: number;
  }>;
};

export type PublishReelsVideoInput = {
  req: Request;
  userId: number;
  title: string;
  description: string;
  hashtags: string[];
  durationSeconds: number;
  videoUrl: string;
  thumbnailUrl: string | null;
  thumbPath: string | null;
  videoPath: string | null;
  deferModeration?: boolean;
  videoFormat?: "watch" | "vibe";
  commentsEnabled?: boolean;
  sharesEnabled?: boolean;
  editorMetadata?: VideoEditorMetadata | null;
  musicTitle?: string | null;
  musicArtist?: string | null;
  musicUrl?: string | null;
};

const VIBE_MAX_SECONDS = 60;

export function resolveVideoFormat(
  durationSeconds: number,
  explicit?: string | null,
): "watch" | "vibe" {
  if (explicit === "vibe") return "vibe";
  if (explicit === "watch") return "watch";
  return durationSeconds > 0 && durationSeconds <= VIBE_MAX_SECONDS ? "vibe" : "watch";
}

export function validateVideoFormatChoice(
  durationSeconds: number,
  format: "watch" | "vibe",
): string | null {
  if (format === "vibe" && durationSeconds > VIBE_MAX_SECONDS) {
    return `Vibe clips must be ${VIBE_MAX_SECONDS} seconds or shorter.`;
  }
  return null;
}

export type PublishReelsVideoResult = {
  videoId: number;
  channelId: number;
  channelHandle: string;
  row: Record<string, unknown>;
  chRow: Record<string, unknown> | undefined;
  modResult: ModerationScanResult | null;
  pending: boolean;
  message?: string;
};

async function runModerationAndNotify(
  input: PublishReelsVideoInput,
  videoId: number,
  channelId: number,
  channelHandle: string,
  title: string,
  videoPublicUrl: string,
): Promise<ModerationScanResult> {
  const modResult = await moderateReelsUpload({
    videoId,
    title: input.title,
    description: input.description,
    hashtags: input.hashtags,
    thumbnailPath: input.thumbPath,
    thumbnailUrl: input.thumbnailUrl,
    videoPublicUrl,
    durationSeconds: input.durationSeconds,
  });
  await applyVideoModerationResult(videoId, modResult);

  if (modResult.action === "approve") {
    void notifySubscribersNewVideo(channelId, videoId, title, channelHandle);
    void evaluateChannelMonetization(channelId);
  }

  return modResult;
}

export async function publishReelsVideo(input: PublishReelsVideoInput): Promise<PublishReelsVideoResult> {
  const ch = await query("SELECT id FROM reels_channels WHERE user_id = $1", [input.userId]);
  if (ch.rows.length === 0) {
    throw new Error("CHANNEL_REQUIRED");
  }
  const channelId = Number(ch.rows[0].id);

  const videoFormat = resolveVideoFormat(input.durationSeconds, input.videoFormat);
  const formatErr = validateVideoFormatChoice(input.durationSeconds, videoFormat);
  if (formatErr) throw new Error(`FORMAT_INVALID:${formatErr}`);

  const commentsEnabled = input.commentsEnabled !== false;
  const sharesEnabled = input.sharesEnabled !== false;
  const editorJson = input.editorMetadata ? JSON.stringify(input.editorMetadata) : null;
  const musicTitle = input.musicTitle?.trim().slice(0, 200) || null;
  const musicArtist = input.musicArtist?.trim().slice(0, 200) || null;
  const musicUrl = input.musicUrl?.trim().slice(0, 2000) || null;

  await ensureReelsShareSlugs();
  let row: Record<string, unknown> | undefined;
  for (let attempt = 0; attempt < 6; attempt++) {
    const shareSlug = generateReelsVideoShareSlug();
    try {
      const inserted = await query(
        `INSERT INTO reels_videos (
           channel_id, title, description, hashtags, video_url, thumbnail_url, duration_seconds,
           status, play_enabled, moderation_status, share_slug,
           video_format, comments_enabled, shares_enabled,
           editor_metadata, music_title, music_artist, music_url
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending_review', FALSE, 'pending_scan', $8,
           $9, $10, $11, $12::jsonb, $13, $14, $15) RETURNING *`,
        [
          channelId,
          input.title.slice(0, 200),
          input.description || null,
          input.hashtags,
          input.videoUrl,
          input.thumbnailUrl,
          input.durationSeconds,
          shareSlug,
          videoFormat,
          commentsEnabled,
          sharesEnabled,
          editorJson,
          musicTitle,
          musicArtist,
          musicUrl,
        ],
      );
      row = inserted.rows[0] as Record<string, unknown>;
      break;
    } catch {
      if (attempt === 5) throw new Error("SHARE_SLUG_FAILED");
    }
  }
  if (!row) throw new Error("INSERT_FAILED");
  const videoId = Number(row.id);

  const channel = await query(
    "SELECT handle, avatar_url, updated_at FROM reels_channels WHERE id = $1",
    [row.channel_id],
  );
  const chRow = channel.rows[0] as Record<string, unknown> | undefined;
  const channelHandle = String(chRow?.handle ?? "");
  const title = input.title;

  const videoPublicUrl =
    resolveStoredMediaUrl(input.req, input.videoUrl)
    ?? input.videoUrl;

  if (input.videoPath) {
    scheduleS3Upload(input.videoPath, input.videoUrl, auditFromRequest(input.req, {
      sourceApp: "reels",
      sourceContext: "video_publish",
      uploaderType: "user",
      uploaderUserId: input.userId,
      entityType: "reels_video",
      entityId: videoId,
      originalFilename: path.basename(input.videoPath),
    }));
  }
  if (input.thumbPath && input.thumbnailUrl) {
    await uploadLocalFileToS3(input.thumbPath, input.thumbnailUrl, auditFromRequest(input.req, {
      sourceApp: "reels",
      sourceContext: "video_thumbnail",
      uploaderType: "user",
      uploaderUserId: input.userId,
      entityType: "reels_video",
      entityId: videoId,
      originalFilename: path.basename(input.thumbPath),
    }));
  }

  void linkS3UploadEntity(input.videoUrl, "reels_video", videoId);
  if (input.thumbnailUrl) void linkS3UploadEntity(input.thumbnailUrl, "reels_video", videoId);

  if (input.deferModeration) {
    void runModerationAndNotify(input, videoId, channelId, channelHandle, title, videoPublicUrl);
    return {
      videoId,
      channelId,
      channelHandle,
      row,
      chRow,
      modResult: null,
      pending: true,
      message: "Video uploaded. Safety review is running — it will go public when approved.",
    };
  }

  const modResult = await runModerationAndNotify(
    input,
    videoId,
    channelId,
    channelHandle,
    title,
    videoPublicUrl,
  );

  if (modResult.action === "reject") {
    return {
      videoId,
      channelId,
      channelHandle,
      row,
      chRow,
      modResult,
      pending: false,
      message: modResult.reason ?? "Video blocked: nudity or sexual content detected.",
    };
  }

  return {
    videoId,
    channelId,
    channelHandle,
    row,
    chRow,
    modResult,
    pending: modResult.action === "pending",
    message: modResult.action === "pending"
      ? (modResult.reason ?? "Video is under safety review. It will go public when approved.")
      : undefined,
  };
}

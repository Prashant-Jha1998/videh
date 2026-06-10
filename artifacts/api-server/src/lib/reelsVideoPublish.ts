import type { Request } from "express";
import { query } from "./db";
import { resolveStoredMediaUrl } from "./mediaStorage";
import {
  applyVideoModerationResult,
  moderateReelsUpload,
  type ModerationScanResult,
} from "./reelsContentModeration";
import { evaluateChannelMonetization } from "./reelsMonetization";
import { notifySubscribersNewVideo } from "./reelsNotifications";
import { scheduleS3Upload, uploadLocalFileToS3 } from "./s3Storage";

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
};

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

  const inserted = await query(
    `INSERT INTO reels_videos (
       channel_id, title, description, hashtags, video_url, thumbnail_url, duration_seconds,
       status, play_enabled, moderation_status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending_review', FALSE, 'pending_scan') RETURNING *`,
    [
      channelId,
      input.title.slice(0, 200),
      input.description || null,
      input.hashtags,
      input.videoUrl,
      input.thumbnailUrl,
      input.durationSeconds,
    ],
  );
  const row = inserted.rows[0] as Record<string, unknown>;
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
    scheduleS3Upload(input.videoPath, input.videoUrl);
  }
  if (input.thumbPath && input.thumbnailUrl) {
    await uploadLocalFileToS3(input.thumbPath, input.thumbnailUrl);
  }

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

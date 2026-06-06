import * as ImageManipulator from "expo-image-manipulator";
import { Image, Platform } from "react-native";
import { getApiUrl } from "./api";
import { jsonAuthHeaders } from "./authHeaders";
import { clampCropRect, ensureEditableImageUri } from "./imageEdit";
import { ensureUploadableFileUri } from "./prepareFileUpload";
import { getWebFile } from "./web/webFileRegistry";

export type ReelsChannel = {
  id: number;
  userId: number;
  handle: string;
  avatarUrl: string | null;
  bio: string | null;
  subscriberCount: number;
  totalViews: number;
  totalViewHours: number;
  totalLikes?: number;
  totalComments?: number;
  totalShares?: number;
  fraudScore?: number;
  monetizationEligible?: boolean;
  monetizationStatus?: string;
  isSubscribed?: boolean;
  ownerName?: string | null;
};

export type ReelsPublicRules = {
  monetization: { rules: string[]; revenueSharePercent: number };
  playButton: { rules: string[] };
  feed: { rules: string[] };
  contentModeration?: { rules: string[] };
};

export type ReelsMonetizationStatus = {
  eligible: boolean;
  status: string;
  reasons: string[];
  revenueSharePercent: number;
};

export type ReelsVideo = {
  id: number;
  channelId: number;
  title: string;
  description: string;
  hashtags: string[];
  videoUrl: string;
  thumbnailUrl: string | null;
  durationSeconds: number;
  viewCount: number;
  likeCount: number;
  dislikeCount: number;
  commentCount: number;
  shareCount?: number;
  playEnabled?: boolean;
  status?: string;
  moderationStatus?: string;
  moderationReason?: string | null;
  channelHandle: string | null;
  channelAvatarUrl: string | null;
  myReaction?: "like" | "dislike" | null;
  createdAt?: string;
};

export const REELS_HANDLE_RE = /^[a-zA-Z][a-zA-Z0-9_]{2,29}$/;
export const MAX_REELS_VIDEO_SECONDS = 300;
/** YouTube-style thumbnail: 16:9 */
export const REELS_THUMB_WIDTH = 1280;
export const REELS_THUMB_HEIGHT = 720;
export const REELS_THUMB_ASPECT = 16 / 9;
export const REELS_THUMB_HINT = `16:9 · ${REELS_THUMB_WIDTH}×${REELS_THUMB_HEIGHT} recommended (JPG/PNG)`;

/** Crop to 16:9 and resize to standard reels thumbnail size. */
export async function prepareReelsThumbnail(uri: string): Promise<string> {
  const local = await ensureEditableImageUri(uri);
  const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    Image.getSize(local, (width, height) => resolve({ width, height }), reject);
  });
  const targetAspect = REELS_THUMB_ASPECT;
  const srcAspect = size.width / size.height;
  const crop = srcAspect > targetAspect
    ? {
        originX: (size.width - size.height * targetAspect) / 2,
        originY: 0,
        width: size.height * targetAspect,
        height: size.height,
      }
    : {
        originX: 0,
        originY: (size.height - size.width / targetAspect) / 2,
        width: size.width,
        height: size.width / targetAspect,
      };
  const result = await ImageManipulator.manipulateAsync(
    local,
    [
      { crop: clampCropRect(crop, size.width, size.height) },
      { resize: { width: REELS_THUMB_WIDTH, height: REELS_THUMB_HEIGHT } },
    ],
    { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
  );
  return result.uri;
}

function reelsUrl(path: string, sessionToken?: string | null) {
  return `${getApiUrl()}/api/reels${path}`;
}

async function reelsJson<T>(
  path: string,
  opts?: { method?: string; body?: unknown; sessionToken?: string | null },
): Promise<T> {
  const res = await fetch(reelsUrl(path, opts?.sessionToken), {
    method: opts?.method ?? "GET",
    headers: {
      ...jsonAuthHeaders(opts?.sessionToken),
      ...(opts?.body ? { "Content-Type": "application/json" } : {}),
    },
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  });
  return res.json() as Promise<T>;
}

export async function checkReelsHandle(handle: string, sessionToken?: string | null) {
  const enc = encodeURIComponent(handle.replace(/^@/, ""));
  return reelsJson<{ success: boolean; available?: boolean; message?: string }>(
    `/handle/check?handle=${enc}`,
    { sessionToken },
  );
}

export async function createReelsChannel(
  userId: number,
  handle: string,
  avatarUrl?: string | null,
  sessionToken?: string | null,
) {
  return reelsJson<{ success: boolean; channel?: ReelsChannel; message?: string }>("/channel", {
    method: "POST",
    body: { userId, handle: handle.replace(/^@/, ""), avatarUrl },
    sessionToken,
  });
}

export async function fetchReelsRules(sessionToken?: string | null) {
  return reelsJson<{ success: boolean; rules: ReelsPublicRules }>("/rules", { sessionToken });
}

export async function fetchMyReelsChannel(userId: number, sessionToken?: string | null) {
  return reelsJson<{
    success: boolean;
    channel: ReelsChannel | null;
    monetization?: ReelsMonetizationStatus;
    rules?: ReelsPublicRules;
  }>(
    `/channel/me?userId=${userId}`,
    { sessionToken },
  );
}

export async function fetchReelsChannel(handle: string, userId?: number, sessionToken?: string | null) {
  const q = userId ? `?userId=${userId}` : "";
  return reelsJson<{
    success: boolean;
    channel: ReelsChannel;
    videos: ReelsVideo[];
    monetization?: ReelsMonetizationStatus;
    rules?: ReelsPublicRules;
    message?: string;
  }>(
    `/channel/${encodeURIComponent(handle.replace(/^@/, ""))}${q}`,
    { sessionToken },
  );
}

export async function fetchReelsFeed(userId: number, cursor?: number, sessionToken?: string | null) {
  const c = cursor ? `&cursor=${cursor}` : "";
  return reelsJson<{ success: boolean; videos: ReelsVideo[]; nextCursor: number | null }>(
    `/feed?userId=${userId}&limit=20${c}`,
    { sessionToken },
  );
}

export async function searchReels(q: string, userId: number, sessionToken?: string | null) {
  return reelsJson<{ success: boolean; channels: ReelsChannel[]; videos: ReelsVideo[] }>(
    `/search?q=${encodeURIComponent(q)}&userId=${userId}`,
    { sessionToken },
  );
}

export async function fetchReelsVideo(videoId: number, userId: number, sessionToken?: string | null) {
  return reelsJson<{
    success: boolean;
    video: ReelsVideo;
    playAllowed?: boolean;
    playBlockReasons?: string[];
    message?: string;
  }>(
    `/videos/${videoId}?userId=${userId}`,
    { sessionToken },
  );
}

export async function recordReelsView(
  videoId: number,
  userId: number,
  watchedSeconds: number,
  sessionToken?: string | null,
) {
  return reelsJson<{ success: boolean }>(`/videos/${videoId}/view`, {
    method: "POST",
    body: { userId, watchedSeconds },
    sessionToken,
  });
}

export async function reactReelsVideo(
  videoId: number,
  userId: number,
  reaction: "like" | "dislike",
  sessionToken?: string | null,
) {
  return reelsJson<{ success: boolean; reaction: string }>(`/videos/${videoId}/react`, {
    method: "POST",
    body: { userId, reaction },
    sessionToken,
  });
}

export async function fetchReelsComments(videoId: number, sessionToken?: string | null) {
  return reelsJson<{
    success: boolean;
    comments: { id: number; content: string; user_name: string; avatar_url?: string; created_at: string }[];
  }>(`/videos/${videoId}/comments`, { sessionToken });
}

export async function postReelsComment(
  videoId: number,
  userId: number,
  content: string,
  sessionToken?: string | null,
) {
  return reelsJson<{ success: boolean }>(`/videos/${videoId}/comments`, {
    method: "POST",
    body: { userId, content },
    sessionToken,
  });
}

export async function subscribeReelsChannel(
  channelId: number,
  userId: number,
  sessionToken?: string | null,
) {
  return reelsJson<{ success: boolean }>(`/subscribe/${channelId}`, {
    method: "POST",
    body: { userId },
    sessionToken,
  });
}

export async function shareReelsVideo(
  videoId: number,
  userId: number,
  sessionToken?: string | null,
) {
  return reelsJson<{ success: boolean }>(`/videos/${videoId}/share`, {
    method: "POST",
    body: { userId },
    sessionToken,
  });
}

export async function unsubscribeReelsChannel(
  channelId: number,
  userId: number,
  sessionToken?: string | null,
) {
  return reelsJson<{ success: boolean }>(`/subscribe/${channelId}?userId=${userId}`, {
    method: "DELETE",
    sessionToken,
  });
}

export type UploadReelsVideoOpts = {
  userId: number;
  title: string;
  description: string;
  hashtags: string;
  durationSeconds: number;
  videoUri: string;
  videoMime: string;
  thumbnailUri?: string;
  sessionToken?: string | null;
  onProgress?: (pct: number) => void;
};

export function uploadReelsVideo(opts: UploadReelsVideoOpts): Promise<{
  success: boolean;
  pending?: boolean;
  video?: ReelsVideo;
  message?: string;
  moderationStatus?: string;
}> {
  const {
    userId, title, description, hashtags, durationSeconds,
    videoUri, videoMime, thumbnailUri, sessionToken, onProgress,
  } = opts;

  return ensureUploadableFileUri(videoUri, "reels_video.mp4").then((vUri) => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${getApiUrl()}/api/reels/videos`);
    if (sessionToken) xhr.setRequestHeader("Authorization", `Bearer ${sessionToken}`);

    xhr.upload.onprogress = (ev) => {
      if (!ev.lengthComputable || !onProgress) return;
      onProgress(Math.min(100, Math.round((ev.loaded / ev.total) * 100)));
    };

    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText) as {
          success: boolean;
          pending?: boolean;
          video?: ReelsVideo;
          message?: string;
          moderationStatus?: string;
        };
        if (xhr.status >= 200 && xhr.status < 300 && data.success) resolve(data);
        else resolve({
          success: false,
          message: data.message ?? "Upload failed",
          moderationStatus: data.moderationStatus,
        });
      } catch {
        reject(new Error("Upload failed"));
      }
    };
    xhr.onerror = () => reject(new Error("Network error"));

    const form = new FormData();
    form.append("userId", String(userId));
    form.append("title", title);
    form.append("description", description);
    form.append("hashtags", hashtags);
    form.append("durationSeconds", String(durationSeconds));

    const webVideo = Platform.OS === "web" ? getWebFile(vUri) : undefined;
    if (webVideo) {
      form.append("video", webVideo, "video.mp4");
    } else {
      form.append("video", { uri: vUri, name: "video.mp4", type: videoMime } as unknown as Blob);
    }

    if (thumbnailUri) {
      const webThumb = Platform.OS === "web" ? getWebFile(thumbnailUri) : undefined;
      if (webThumb) {
        form.append("thumbnail", webThumb, "thumb.jpg");
      } else {
        form.append("thumbnail", { uri: thumbnailUri, name: "thumb.jpg", type: "image/jpeg" } as unknown as Blob);
      }
    }

    xhr.send(form);
  }));
}

export function formatViewCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

import * as ImageManipulator from "expo-image-manipulator";
import { Image, Platform } from "react-native";
import { getApiUrl } from "./api";
import { resolvePublicAssetUrl } from "./publicAssetUrl";
import { jsonAuthHeaders } from "./authHeaders";
import { clampCropRect, ensureEditableImageUri } from "./imageEdit";
import { ensureUploadableFileUri } from "./prepareFileUpload";
import { putFileToPresignedUrl, type PresignedUploadSlot } from "./s3DirectUpload";
import { getWebFile } from "./web/webFileRegistry";

export type ReelsChannel = {
  id: number;
  userId?: number;
  handle: string;
  displayName?: string;
  avatarUrl: string | null;
  coverUrl?: string | null;
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
  isOwner?: boolean;
  createdAt?: string;
  videoCount?: number;
};

export type ReelsChannelLink = {
  id: number;
  title: string;
  url: string;
  sortOrder?: number;
};

export type ReelsPlaylist = {
  id: number;
  title: string;
  description?: string | null;
  videoCount: number;
  thumbnailUrl?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type ReelsPublicRules = {
  monetization: {
    rules: string[];
    revenueSharePercent: number;
    minSubscribers: number;
    minWatchHours: number;
    minPublicVideos: number;
  };
  playButton: { rules: string[] };
  feed: { rules: string[] };
  contentModeration?: { rules: string[] };
  privacy?: { rules: string[] };
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
  channelDisplayName?: string | null;
  channelAvatarUrl: string | null;
  myReaction?: "like" | "dislike" | null;
  createdAt?: string;
  /** Native upload height in px; drives per-video quality menu. */
  sourceHeight?: number | null;
  /** Public HTTPS link — opaque slug URL (not numeric id) */
  shareUrl?: string;
  shareSlug?: string;
  deepLink?: string;
};

export const REELS_HANDLE_RE = /^[a-zA-Z][a-zA-Z0-9_]{2,29}$/;
/** No 5-minute cap — server allows up to 4 hours. */
export const MAX_REELS_VIDEO_SECONDS = 14400;
/** in-stream video thumbnail: 16:9 */
export const REELS_THUMB_WIDTH = 1280;
export const REELS_THUMB_HEIGHT = 720;
export const REELS_THUMB_ASPECT = 16 / 9;
export const REELS_THUMB_HINT = `16:9 · ${REELS_THUMB_WIDTH}×${REELS_THUMB_HEIGHT} recommended (JPG/PNG)`;

/** Channel logo — square, in-stream video profile picture. */
export const CHANNEL_AVATAR_SIZE = 800;
export const CHANNEL_AVATAR_ASPECT = 1;
export const CHANNEL_AVATAR_HINT =
  `Square 1:1 · ${CHANNEL_AVATAR_SIZE}×${CHANNEL_AVATAR_SIZE} px · JPG/PNG · face/logo centered`;

/** Channel cover/banner — 16:9 landscape. */
export const CHANNEL_COVER_WIDTH = 1280;
export const CHANNEL_COVER_HEIGHT = 720;
export const CHANNEL_COVER_ASPECT = 16 / 9;
export const CHANNEL_COVER_HINT =
  `Landscape 16:9 · ${CHANNEL_COVER_WIDTH}×${CHANNEL_COVER_HEIGHT} px · JPG/PNG · keep text in center`;

/** Crop center and resize to exact width × height. */
export async function prepareFixedImage(uri: string, width: number, height: number): Promise<string> {
  const local = await ensureEditableImageUri(uri);
  const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    Image.getSize(local, (w, h) => resolve({ width: w, height: h }), reject);
  });
  const targetAspect = width / height;
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
      { resize: { width, height } },
    ],
    { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
  );
  return result.uri;
}

export function prepareChannelAvatar(uri: string): Promise<string> {
  return prepareFixedImage(uri, CHANNEL_AVATAR_SIZE, CHANNEL_AVATAR_SIZE);
}

export function prepareChannelCover(uri: string): Promise<string> {
  return prepareFixedImage(uri, CHANNEL_COVER_WIDTH, CHANNEL_COVER_HEIGHT);
}

/** Crop to 16:9 and resize to standard reels thumbnail size. */
export async function prepareReelsThumbnail(uri: string): Promise<string> {
  return prepareFixedImage(uri, REELS_THUMB_WIDTH, REELS_THUMB_HEIGHT);
}

/** Auto-pick one frame from a local video when user skipped manual thumbnail. */
export async function autoThumbnailFromVideo(videoUri: string, durationSeconds = 0): Promise<string | null> {
  try {
    const VideoThumbnails = await import("expo-video-thumbnails");
    const timeMs = durationSeconds > 10
      ? Math.min(5000, Math.floor(durationSeconds * 100)) : 1000;
    const { uri } = await VideoThumbnails.getThumbnailAsync(videoUri, {
      time: timeMs,
      quality: 0.85,
    });
    return prepareReelsThumbnail(uri);
  } catch {
    return null;
  }
}

/** Direct API route for channel logo/cover (fallback when CDN URL is not ready). */
export function channelBrandingApiUrl(
  channelId: number,
  kind: "avatar" | "cover",
  cacheVersion?: string | null,
): string {
  const base = getApiUrl().replace(/\/$/, "");
  const v = cacheVersion != null ? String(cacheVersion).trim() : "";
  const q = v ? `?v=${encodeURIComponent(v)}` : "";
  return `${base}/api/reels/channels/${channelId}/${kind}${q}`;
}

/** Fix stored media URLs (wrong host or relative /uploads paths) for Image/Video components. */
export function normalizeReelsMediaUrl(url?: string | null): string | null {
  const raw = String(url ?? "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw) || raw.startsWith("data:")) return raw;
  const base = getApiUrl().replace(/\/$/, "");
  if (raw.startsWith("/api/")) return `${base}${raw}`;
  const uploadsPath = raw.match(/\/uploads\/[^\s?#]+/)?.[0]
    ?? (raw.startsWith("uploads/") ? `/${raw.split(/[?#]/)[0]}` : null);
  if (uploadsPath) {
    return `${base}${uploadsPath}`;
  }
  return resolvePublicAssetUrl(raw) ?? raw;
}

function normalizeReelsChannel(ch: ReelsChannel): ReelsChannel {
  return {
    ...ch,
    avatarUrl: normalizeReelsMediaUrl(ch.avatarUrl),
    coverUrl: normalizeReelsMediaUrl(ch.coverUrl ?? null),
  };
}

function normalizeReelsPlaylist(pl: ReelsPlaylist): ReelsPlaylist {
  return {
    ...pl,
    thumbnailUrl: normalizeReelsMediaUrl(pl.thumbnailUrl ?? null),
  };
}

function normalizeReelsVideo(v: ReelsVideo): ReelsVideo {
  return {
    ...v,
    thumbnailUrl: normalizeReelsMediaUrl(v.thumbnailUrl),
    videoUrl: normalizeReelsMediaUrl(v.videoUrl) ?? v.videoUrl,
    channelAvatarUrl: normalizeReelsMediaUrl(v.channelAvatarUrl),
  };
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

export async function fetchMyReelsChannel(
  userId: number,
  sessionToken?: string | null,
  opts?: { summary?: boolean },
) {
  const summaryQ = opts?.summary ? "&summary=1" : "";
  const res = await reelsJson<{
    success: boolean;
    channel: ReelsChannel | null;
    links?: ReelsChannelLink[];
    playlists?: ReelsPlaylist[];
    monetization?: ReelsMonetizationStatus;
    rules?: ReelsPublicRules;
  }>(
    `/channel/me?userId=${userId}${summaryQ}`,
    { sessionToken },
  );
  if (res.channel) res.channel = normalizeReelsChannel(res.channel);
  if (res.playlists) res.playlists = res.playlists.map(normalizeReelsPlaylist);
  return res;
}

export async function fetchReelsLibrary(userId: number, sessionToken?: string | null) {
  const res = await reelsJson<{
    success: boolean;
    channel: ReelsChannel | null;
    history: ReelsVideo[];
    liked: ReelsVideo[];
    playlists: ReelsPlaylist[];
    myVideos: ReelsVideo[];
    message?: string;
  }>(`/library?userId=${userId}`, { sessionToken });
  if (res.channel) res.channel = normalizeReelsChannel(res.channel);
  if (res.history) res.history = res.history.map(normalizeReelsVideo);
  if (res.liked) res.liked = res.liked.map(normalizeReelsVideo);
  if (res.myVideos) res.myVideos = res.myVideos.map(normalizeReelsVideo);
  if (res.playlists) res.playlists = res.playlists.map(normalizeReelsPlaylist);
  return res;
}

export async function fetchReelsChannel(handle: string, userId?: number, sessionToken?: string | null) {
  const q = userId ? `?userId=${userId}` : "";
  const res = await reelsJson<{
    success: boolean;
    channel: ReelsChannel;
    videos: ReelsVideo[];
    links?: ReelsChannelLink[];
    playlists?: ReelsPlaylist[];
    monetization?: ReelsMonetizationStatus;
    rules?: ReelsPublicRules;
    message?: string;
  }>(
    `/channel/${encodeURIComponent(handle.replace(/^@/, ""))}${q}`,
    { sessionToken },
  );
  if (res.channel) res.channel = normalizeReelsChannel(res.channel);
  if (res.videos) res.videos = res.videos.map(normalizeReelsVideo);
  if (res.playlists) res.playlists = res.playlists.map(normalizeReelsPlaylist);
  return res;
}

export type ReelsFeedCursor = { at?: string; id: number; score?: number };

export type ReelsFeedAd = {
  id: number;
  format: "video" | "image" | "app_install" | "shopping";
  title: string;
  headline: string;
  description: string;
  imageUrl: string | null;
  videoUrl: string | null;
  ctaType: string;
  destinationUrl: string | null;
  playStoreUrl: string | null;
  appStoreUrl: string | null;
  appName: string | null;
  advertiserName: string;
  sponsoredLabel: string;
};

export type ReelsFeedAdPlacement = {
  insertAfterIndex: number;
  ad: ReelsFeedAd;
};

export async function fetchReelsFeed(
  userId: number,
  cursor?: ReelsFeedCursor | null,
  sessionToken?: string | null,
) {
  const c = cursor
    ? cursor.score != null && Number.isFinite(cursor.score)
      ? `&cursorScore=${encodeURIComponent(String(cursor.score))}&cursorId=${cursor.id}`
      : cursor.at
        ? `&cursorAt=${encodeURIComponent(cursor.at)}&cursorId=${cursor.id}`
        : ""
    : "";
  const res = await reelsJson<{
    success: boolean;
    videos: ReelsVideo[];
    trending?: ReelsVideo[];
    nextCursor: ReelsFeedCursor | null;
    feedAdPlacements?: ReelsFeedAdPlacement[];
    feedAdMinGap?: number;
    feedAdMaxGap?: number;
  }>(
    `/feed?userId=${userId}&limit=15${c}`,
    { sessionToken },
  );
  res.videos = (res.videos ?? []).map(normalizeReelsVideo);
  if (res.trending) res.trending = res.trending.map(normalizeReelsVideo);
  return res;
}

export type ReelsVideoNotification = {
  id: number;
  videoId: number;
  channelId: number;
  kind: string;
  read: boolean;
  createdAt: string;
  videoTitle: string;
  thumbnailUrl: string | null;
  channelHandle: string | null;
  channelDisplayName: string | null;
  channelAvatarUrl: string | null;
};

function normalizeReelsVideoNotification(n: ReelsVideoNotification): ReelsVideoNotification {
  return {
    ...n,
    thumbnailUrl: normalizeReelsMediaUrl(n.thumbnailUrl),
    channelAvatarUrl: normalizeReelsMediaUrl(n.channelAvatarUrl),
  };
}

export async function fetchReelsVideoNotifications(
  userId: number,
  sessionToken?: string | null,
  limit = 50,
) {
  const res = await reelsJson<{
    success: boolean;
    notifications?: ReelsVideoNotification[];
    unreadCount?: number;
    message?: string;
  }>(`/notifications?userId=${userId}&limit=${limit}`, { sessionToken });
  if (res.notifications) {
    res.notifications = res.notifications.map(normalizeReelsVideoNotification);
  }
  return res;
}

export async function fetchReelsVideoNotificationUnreadCount(
  userId: number,
  sessionToken?: string | null,
) {
  return reelsJson<{ success: boolean; count?: number }>(
    `/notifications/unread-count?userId=${userId}`,
    { sessionToken },
  );
}

export async function markReelsVideoNotificationsRead(
  userId: number,
  sessionToken?: string | null,
  notificationIds?: number[],
) {
  return reelsJson<{ success: boolean; unreadCount?: number }>(
    "/notifications/read",
    { method: "POST", body: { userId, notificationIds }, sessionToken },
  );
}

export async function hideReelsVideoNotification(
  userId: number,
  notificationId: number,
  sessionToken?: string | null,
) {
  return reelsJson<{ success: boolean; unreadCount?: number }>(
    `/notifications/${notificationId}?userId=${userId}`,
    { method: "DELETE", body: { userId }, sessionToken },
  );
}

export async function searchReels(q: string, userId: number, sessionToken?: string | null) {
  const res = await reelsJson<{ success: boolean; channels: ReelsChannel[]; videos: ReelsVideo[] }>(
    `/search?q=${encodeURIComponent(q)}&userId=${userId}`,
    { sessionToken },
  );
  if (res.channels) res.channels = res.channels.map(normalizeReelsChannel);
  if (res.videos) res.videos = res.videos.map(normalizeReelsVideo);
  return res;
}

export type ReelsHashtagStat = {
  tag: string;
  videoCount: number;
  viewCount: number;
};

/** Last partial hashtag being typed (after comma or space). */
export function activeHashtagQuery(raw: string): string {
  const lastComma = raw.lastIndexOf(",");
  const segment = lastComma >= 0 ? raw.slice(lastComma + 1) : raw;
  const parts = segment.trim().split(/\s+/);
  return (parts[parts.length - 1] ?? "").replace(/^#/, "").trim().toLowerCase();
}

/** Insert a suggested hashtag into the upload field. */
export function applyHashtagSuggestion(raw: string, tag: string): string {
  const lastComma = raw.lastIndexOf(",");
  const head = lastComma >= 0 ? `${raw.slice(0, lastComma + 1)} ` : "";
  const segment = lastComma >= 0 ? raw.slice(lastComma + 1) : raw;
  const parts = segment.trim().split(/\s+/);
  parts.pop();
  const existing = parts.map((t) => t.replace(/^#/, "").trim()).filter(Boolean);
  const joined = [...existing, tag].join(", ");
  return `${head}${joined}, `;
}

export async function suggestReelsHashtags(
  q: string,
  sessionToken?: string | null,
  limit = 8,
) {
  return reelsJson<{ success: boolean; hashtags?: ReelsHashtagStat[] }>(
    `/hashtags/suggest?q=${encodeURIComponent(q)}&limit=${limit}`,
    { sessionToken },
  );
}

export async function fetchHashtagReels(
  tag: string,
  userId: number,
  sessionToken?: string | null,
) {
  const enc = encodeURIComponent(tag.replace(/^#/, ""));
  const res = await reelsJson<{
    success: boolean;
    hashtag?: ReelsHashtagStat;
    videos?: ReelsVideo[];
  }>(`/hashtags/${enc}?userId=${userId}`, { sessionToken });
  if (res.videos) res.videos = res.videos.map(normalizeReelsVideo);
  return res;
}

export async function fetchReelsVideo(videoId: number, userId: number, sessionToken?: string | null) {
  const res = await reelsJson<{
    success: boolean;
    video: ReelsVideo;
    playAllowed?: boolean;
    playBlockReasons?: string[];
    message?: string;
  }>(
    `/videos/${videoId}?userId=${userId}`,
    { sessionToken },
  );
  if (res.video) res.video = normalizeReelsVideo(res.video);
  return res;
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

export type ReelsAdBreakItem = {
  id: number;
  title: string;
  videoUrl: string;
  durationSeconds: number;
  skipAfterSeconds: number | null;
  adType: "non_skippable" | "skippable";
  placement: "pre_roll" | "mid_roll";
  advertiserName: string;
  format?: "video" | "image" | "app_install" | "shopping" | "bumper" | "shorts_video" | "carousel" | "lead_form";
  headline?: string;
  description?: string;
  imageUrl?: string | null;
  ctaType?: string;
  destinationUrl?: string | null;
  playStoreUrl?: string | null;
  appStoreUrl?: string | null;
  appName?: string | null;
  appDeveloper?: string | null;
  appRating?: number | null;
  appReviewCount?: string | null;
  appDownloadCount?: string | null;
  appCategory?: string | null;
  appPriceLabel?: string;
  promoImageUrl?: string | null;
  promoImageUrl2?: string | null;
  sponsoredLabel?: string;
};

export type ReelsMidRollBreak = {
  offsetSeconds: number;
  ad: ReelsAdBreakItem;
};

export type ReelsAdBreaks = {
  enabled: boolean;
  preRoll: ReelsAdBreakItem[];
  midRoll: ReelsMidRollBreak[];
};

export async function fetchReelsAdBreaks(
  videoId: number,
  userId: number,
  sessionToken?: string | null,
) {
  return reelsJson<ReelsAdBreaks & { success: boolean }>(
    `/videos/${videoId}/ad-breaks?userId=${userId}`,
    { sessionToken },
  );
}

export async function recordReelsAdClick(
  opts: {
    creativeId: number;
    userId: number;
    placement: string;
    clickTarget: "cta" | "play_store" | "app_store" | "destination";
  },
  sessionToken?: string | null,
) {
  return reelsJson<{ success: boolean }>("/ads/click", {
    method: "POST",
    body: opts,
    sessionToken,
  });
}

export async function recordReelsAdImpression(
  opts: {
    creativeId: number;
    contentVideoId: number;
    userId: number;
    placement: string;
    watchedSeconds: number;
    skipped: boolean;
    completed: boolean;
  },
  sessionToken?: string | null,
) {
  return reelsJson<{ success: boolean }>("/ads/impression", {
    method: "POST",
    body: opts,
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

export type ReelsCommentSort = "top" | "newest";

export type ReelsComment = {
  id: number;
  content: string;
  displayName: string;
  channelHandle?: string | null;
  avatarUrl?: string | null;
  createdAt: string;
  likeCount: number;
  replyCount: number;
  myReaction?: "like" | "dislike" | null;
  parentId?: number | null;
};

function normalizeReelsComment(raw: Record<string, unknown>): ReelsComment {
  return {
    id: Number(raw.id),
    content: String(raw.content ?? ""),
    displayName: String(raw.displayName ?? "User"),
    channelHandle: raw.channelHandle != null ? String(raw.channelHandle) : null,
    avatarUrl: normalizeReelsMediaUrl(raw.avatarUrl != null ? String(raw.avatarUrl) : null),
    createdAt: String(raw.createdAt ?? ""),
    likeCount: Number(raw.likeCount ?? 0),
    replyCount: Number(raw.replyCount ?? 0),
    myReaction: raw.myReaction === "like" || raw.myReaction === "dislike"
      ? raw.myReaction
      : null,
    parentId: raw.parentId != null ? Number(raw.parentId) : null,
  };
}

export async function fetchReelsComments(
  videoId: number,
  userId: number,
  sort: ReelsCommentSort = "top",
  sessionToken?: string | null,
) {
  const res = await reelsJson<{
    success: boolean;
    comments: Record<string, unknown>[];
  }>(`/videos/${videoId}/comments?userId=${userId}&sort=${sort}`, { sessionToken });
  if (res.comments) {
    return { ...res, comments: res.comments.map(normalizeReelsComment) };
  }
  return { ...res, comments: [] as ReelsComment[] };
}

export async function fetchReelsCommentReplies(
  videoId: number,
  commentId: number,
  userId: number,
  sessionToken?: string | null,
) {
  const res = await reelsJson<{
    success: boolean;
    replies: Record<string, unknown>[];
  }>(`/videos/${videoId}/comments/${commentId}/replies?userId=${userId}`, { sessionToken });
  if (res.replies) {
    return { ...res, replies: res.replies.map(normalizeReelsComment) };
  }
  return { ...res, replies: [] as ReelsComment[] };
}

export async function postReelsComment(
  videoId: number,
  userId: number,
  content: string,
  sessionToken?: string | null,
  parentId?: number | null,
) {
  return reelsJson<{ success: boolean }>(`/videos/${videoId}/comments`, {
    method: "POST",
    body: { userId, content, parentId: parentId ?? null },
    sessionToken,
  });
}

export async function reactReelsComment(
  commentId: number,
  userId: number,
  reaction: "like" | "dislike",
  sessionToken?: string | null,
) {
  return reelsJson<{ success: boolean; reaction: string | null }>(`/comments/${commentId}/react`, {
    method: "POST",
    body: { userId, reaction },
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
  return reelsJson<{ success: boolean; shareUrl?: string }>(`/videos/${videoId}/share`, {
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

export async function deleteReelsVideo(
  videoId: number,
  userId: number,
  sessionToken?: string | null,
) {
  return reelsJson<{ success: boolean; message?: string }>(
    `/videos/${videoId}?userId=${userId}`,
    { method: "DELETE", sessionToken },
  );
}

export async function updateReelsVideo(
  videoId: number,
  userId: number,
  opts: { title?: string; description?: string; hashtags?: string },
  sessionToken?: string | null,
) {
  const res = await reelsJson<{ success: boolean; video?: ReelsVideo; message?: string }>(
    `/videos/${videoId}`,
    { method: "PATCH", body: { userId, ...opts }, sessionToken },
  );
  if (res.video) res.video = normalizeReelsVideo(res.video);
  return res;
}

export async function addReelsVideoToPlaylist(
  userId: number,
  playlistId: number,
  videoId: number,
  sessionToken?: string | null,
) {
  const res = await reelsJson<{ success: boolean; playlists?: ReelsPlaylist[]; message?: string }>(
    `/channel/me/playlists/${playlistId}/videos`,
    { method: "POST", body: { userId, videoId }, sessionToken },
  );
  if (res.playlists) res.playlists = res.playlists.map(normalizeReelsPlaylist);
  return res;
}

export async function reportReelsVideo(
  videoId: number,
  userId: number,
  reason: string,
  sessionToken?: string | null,
  details?: string,
) {
  return reelsJson<{ success: boolean; message?: string }>(
    `/videos/${videoId}/report`,
    { method: "POST", body: { userId, reason, details }, sessionToken },
  );
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

type UploadIntentResponse = {
  success: boolean;
  directUpload?: boolean;
  video?: PresignedUploadSlot;
  thumbnail?: PresignedUploadSlot | null;
  message?: string;
};

type CompleteUploadResponse = {
  success: boolean;
  pending?: boolean;
  video?: ReelsVideo;
  message?: string;
  moderationStatus?: string;
};

async function fetchReelsUploadIntent(
  userId: number,
  videoMime: string,
  hasThumbnail: boolean,
  sessionToken?: string | null,
): Promise<UploadIntentResponse> {
  return reelsJson<UploadIntentResponse>("/videos/upload-intent", {
    method: "POST",
    sessionToken,
    body: {
      userId,
      videoContentType: videoMime,
      hasThumbnail,
      thumbnailContentType: "image/jpeg",
    },
  });
}

async function completeReelsDirectUpload(
  opts: UploadReelsVideoOpts & {
    videoUploadsRel: string;
    thumbnailUploadsRel?: string;
  },
): Promise<CompleteUploadResponse> {
  const res = await reelsJson<CompleteUploadResponse>("/videos/complete", {
    method: "POST",
    sessionToken: opts.sessionToken,
    body: {
      userId: opts.userId,
      title: opts.title,
      description: opts.description,
      hashtags: opts.hashtags,
      durationSeconds: opts.durationSeconds,
      videoUploadsRel: opts.videoUploadsRel,
      thumbnailUploadsRel: opts.thumbnailUploadsRel,
    },
  });
  if (res.video) res.video = normalizeReelsVideo(res.video);
  return res;
}

async function uploadReelsVideoViaS3(opts: UploadReelsVideoOpts): Promise<CompleteUploadResponse | null> {
  const intent = await fetchReelsUploadIntent(
    opts.userId,
    opts.videoMime,
    Boolean(opts.thumbnailUri),
    opts.sessionToken,
  );
  if (!intent.success || !intent.directUpload || !intent.video?.uploadUrl) {
    return null;
  }

  const report = (pct: number) => opts.onProgress?.(pct);

  await putFileToPresignedUrl({
    presignedUrl: intent.video.uploadUrl,
    localUri: opts.videoUri,
    contentType: intent.video.contentType || opts.videoMime,
    filename: "reels_video.mp4",
    onProgress: (p) => report(Math.round(p * 0.92)),
  });

  let thumbnailUploadsRel: string | undefined;
  if (opts.thumbnailUri && intent.thumbnail?.uploadUrl) {
    await putFileToPresignedUrl({
      presignedUrl: intent.thumbnail.uploadUrl,
      localUri: opts.thumbnailUri,
      contentType: intent.thumbnail.contentType || "image/jpeg",
      filename: "reels_thumb.jpg",
      onProgress: (p) => report(92 + Math.round(p * 0.06)),
    });
    thumbnailUploadsRel = intent.thumbnail.uploadsRel;
  }

  report(98);
  const done = await completeReelsDirectUpload({
    ...opts,
    videoUploadsRel: intent.video.uploadsRel,
    thumbnailUploadsRel,
  });
  report(100);
  return done;
}

function uploadReelsVideoLegacy(opts: UploadReelsVideoOpts): Promise<{
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

export async function uploadReelsVideo(opts: UploadReelsVideoOpts): Promise<{
  success: boolean;
  pending?: boolean;
  video?: ReelsVideo;
  message?: string;
  moderationStatus?: string;
}> {
  try {
    const direct = await uploadReelsVideoViaS3(opts);
    if (direct) {
      if (direct.success) return direct;
      return {
        success: false,
        message: direct.message ?? "Upload failed",
        moderationStatus: direct.moderationStatus,
      };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg && !msg.includes("Network") && !msg.includes("Upload")) {
      throw e;
    }
  }
  return uploadReelsVideoLegacy(opts);
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

export function formatTimeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export function updateChannelProfile(opts: {
  userId: number;
  sessionToken?: string;
  displayName?: string;
  bio?: string;
  avatarUri?: string;
  coverUri?: string;
}): Promise<{ success: boolean; channel?: ReelsChannel; message?: string }> {
  const { userId, sessionToken, displayName, bio, avatarUri, coverUri } = opts;
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PATCH", `${getApiUrl()}/api/reels/channel/me`);
    if (sessionToken) xhr.setRequestHeader("Authorization", `Bearer ${sessionToken}`);

    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText) as {
          success: boolean;
          channel?: ReelsChannel;
          message?: string;
        };
        if (xhr.status >= 200 && xhr.status < 300 && data.success) {
          if (data.channel) data.channel = normalizeReelsChannel(data.channel);
          resolve(data);
        } else resolve({ success: false, message: data.message ?? "Update failed" });
      } catch {
        reject(new Error("Update failed"));
      }
    };
    xhr.onerror = () => reject(new Error("Network error"));

    const form = new FormData();
    form.append("userId", String(userId));
    if (displayName !== undefined) form.append("displayName", displayName);
    if (bio !== undefined) form.append("bio", bio);
    if (avatarUri) {
      const web = Platform.OS === "web" ? getWebFile(avatarUri) : undefined;
      if (web) form.append("avatar", web, "avatar.jpg");
      else form.append("avatar", { uri: avatarUri, name: "avatar.jpg", type: "image/jpeg" } as unknown as Blob);
    }
    if (coverUri) {
      const web = Platform.OS === "web" ? getWebFile(coverUri) : undefined;
      if (web) form.append("cover", web, "cover.jpg");
      else form.append("cover", { uri: coverUri, name: "cover.jpg", type: "image/jpeg" } as unknown as Blob);
    }
    xhr.send(form);
  });
}

export async function updateChannelLinks(
  userId: number,
  links: { title: string; url: string }[],
  sessionToken?: string | null,
) {
  return reelsJson<{ success: boolean; links?: ReelsChannelLink[]; message?: string }>(
    "/channel/me/links",
    { method: "PUT", body: { userId, links }, sessionToken },
  );
}

export async function createReelsPlaylist(
  userId: number,
  opts: { title: string; description?: string; videoIds?: number[] },
  sessionToken?: string | null,
) {
  const res = await reelsJson<{ success: boolean; playlists?: ReelsPlaylist[]; message?: string }>(
    "/channel/me/playlists",
    { method: "POST", body: { userId, ...opts }, sessionToken },
  );
  if (res.playlists) res.playlists = res.playlists.map(normalizeReelsPlaylist);
  return res;
}

export async function deleteReelsPlaylist(
  userId: number,
  playlistId: number,
  sessionToken?: string | null,
) {
  const res = await reelsJson<{ success: boolean; playlists?: ReelsPlaylist[]; message?: string }>(
    `/channel/me/playlists/${playlistId}?userId=${userId}`,
    { method: "DELETE", body: { userId }, sessionToken },
  );
  if (res.playlists) res.playlists = res.playlists.map(normalizeReelsPlaylist);
  return res;
}

export async function fetchReelsPlaylist(
  handle: string,
  playlistId: number,
  userId?: number,
  sessionToken?: string | null,
) {
  const q = userId ? `?userId=${userId}` : "";
  const res = await reelsJson<{
    success: boolean;
    playlist: ReelsPlaylist;
    videos: ReelsVideo[];
    message?: string;
  }>(
    `/channel/${encodeURIComponent(handle.replace(/^@/, ""))}/playlists/${playlistId}${q}`,
    { sessionToken },
  );
  if (res.videos) res.videos = res.videos.map(normalizeReelsVideo);
  if (res.playlist) res.playlist = normalizeReelsPlaylist(res.playlist);
  return res;
}

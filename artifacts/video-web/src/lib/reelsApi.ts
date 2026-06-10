import { getApiBase } from "./api";
import { authHeaders } from "./auth";

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
  monetizationEligible?: boolean;
  monetizationStatus?: string;
  isSubscribed?: boolean;
  isOwner?: boolean;
  videoCount?: number;
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
  channelHandle: string | null;
  channelDisplayName?: string | null;
  channelAvatarUrl: string | null;
  myReaction?: "like" | "dislike" | null;
  createdAt?: string;
};

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
};

export type ReelsFeedCursor = { at: string; id: number };

function normalizeUrl(url?: string | null): string | null {
  const raw = String(url ?? "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  const base = getApiBase();
  if (raw.startsWith("/")) return `${base}${raw}`;
  return raw;
}

function normalizeVideo(v: ReelsVideo): ReelsVideo {
  return {
    ...v,
    thumbnailUrl: normalizeUrl(v.thumbnailUrl),
    videoUrl: normalizeUrl(v.videoUrl) ?? v.videoUrl,
    channelAvatarUrl: normalizeUrl(v.channelAvatarUrl),
  };
}

function normalizeChannel(c: ReelsChannel): ReelsChannel {
  return {
    ...c,
    avatarUrl: normalizeUrl(c.avatarUrl),
    coverUrl: normalizeUrl(c.coverUrl ?? null),
  };
}

async function reelsFetch<T>(
  path: string,
  opts?: { method?: string; body?: unknown; token?: string | null; formData?: FormData },
): Promise<T> {
  const headers: Record<string, string> = { ...(authHeaders(opts?.token) as Record<string, string>) };
  let body: BodyInit | undefined;
  if (opts?.formData) {
    body = opts.formData;
  } else if (opts?.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(`${getApiBase()}/api/reels${path}`, {
    method: opts?.method ?? "GET",
    headers,
    body,
  });
  return res.json() as Promise<T>;
}

export function videoStreamUrl(videoId: number, maxHeight?: number): string {
  const q = maxHeight ? `?maxHeight=${maxHeight}` : "";
  return `${getApiBase()}/api/reels/videos/${videoId}/stream${q}`;
}

export async function sendOtp(phone: string) {
  const res = await fetch(`${getApiBase()}/api/otp/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone }),
  });
  return res.json() as Promise<{ success: boolean; message?: string }>;
}

export async function verifyOtp(phone: string, otp: string) {
  const res = await fetch(`${getApiBase()}/api/otp/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, otp }),
  });
  return res.json() as Promise<{
    success: boolean;
    user?: { dbId: number; name?: string; phone?: string };
    sessionToken?: string;
    message?: string;
  }>;
}

export async function checkHandle(handle: string, token?: string | null) {
  const enc = encodeURIComponent(handle.replace(/^@/, ""));
  return reelsFetch<{ success: boolean; available?: boolean; message?: string }>(
    `/handle/check?handle=${enc}`,
    { token },
  );
}

export async function createChannel(
  userId: number,
  handle: string,
  bio: string,
  token: string,
) {
  const res = await reelsFetch<{ success: boolean; channel?: ReelsChannel; message?: string }>(
    "/channel",
    {
      method: "POST",
      token,
      body: { userId, handle: handle.replace(/^@/, ""), bio },
    },
  );
  if (res.channel) res.channel = normalizeChannel(res.channel);
  return res;
}

export async function fetchMyChannel(userId: number, token: string) {
  const res = await reelsFetch<{
    success: boolean;
    channel: ReelsChannel | null;
    monetization?: { eligible: boolean; status: string; reasons: string[] };
  }>(`/channel/me?userId=${userId}`, { token });
  if (res.channel) res.channel = normalizeChannel(res.channel);
  return res;
}

export async function fetchChannel(handle: string, userId?: number, token?: string | null) {
  const q = userId ? `?userId=${userId}` : "";
  const res = await reelsFetch<{
    success: boolean;
    channel: ReelsChannel;
    videos: ReelsVideo[];
    message?: string;
  }>(`/channel/${encodeURIComponent(handle.replace(/^@/, ""))}${q}`, { token });
  if (res.channel) res.channel = normalizeChannel(res.channel);
  if (res.videos) res.videos = res.videos.map(normalizeVideo);
  return res;
}

export async function updateChannelProfile(
  userId: number,
  token: string,
  fields: { displayName?: string; bio?: string; avatar?: File; cover?: File },
) {
  const fd = new FormData();
  fd.append("userId", String(userId));
  if (fields.displayName !== undefined) fd.append("displayName", fields.displayName);
  if (fields.bio !== undefined) fd.append("bio", fields.bio);
  if (fields.avatar) fd.append("avatar", fields.avatar);
  if (fields.cover) fd.append("cover", fields.cover);
  const res = await reelsFetch<{ success: boolean; channel?: ReelsChannel; message?: string }>(
    "/channel/me",
    { method: "PATCH", token, formData: fd },
  );
  if (res.channel) res.channel = normalizeChannel(res.channel);
  return res;
}

export async function fetchFeed(userId: number, cursor?: ReelsFeedCursor | null, token?: string | null) {
  const c = cursor ? `&cursorAt=${encodeURIComponent(cursor.at)}&cursorId=${cursor.id}` : "";
  const res = await reelsFetch<{
    success: boolean;
    videos: ReelsVideo[];
    trending?: ReelsVideo[];
    nextCursor: ReelsFeedCursor | null;
  }>(`/feed?userId=${userId}&limit=20${c}`, { token });
  res.videos = (res.videos ?? []).map(normalizeVideo);
  if (res.trending) res.trending = res.trending.map(normalizeVideo);
  return res;
}

export async function searchReels(q: string, userId: number, token?: string | null) {
  const res = await reelsFetch<{
    success: boolean;
    channels: ReelsChannel[];
    videos: ReelsVideo[];
  }>(`/search?q=${encodeURIComponent(q)}&userId=${userId}`, { token });
  if (res.channels) res.channels = res.channels.map(normalizeChannel);
  if (res.videos) res.videos = res.videos.map(normalizeVideo);
  return res;
}

export async function fetchVideo(videoId: number, userId: number, token?: string | null) {
  const res = await reelsFetch<{ success: boolean; video: ReelsVideo; message?: string }>(
    `/videos/${videoId}?userId=${userId}`,
    { token },
  );
  if (res.video) res.video = normalizeVideo(res.video);
  return res;
}

export async function recordView(videoId: number, userId: number, watchedSeconds: number, token?: string | null) {
  return reelsFetch<{ success: boolean }>(`/videos/${videoId}/view`, {
    method: "POST",
    token,
    body: { userId, watchedSeconds },
  });
}

export async function reactVideo(
  videoId: number,
  userId: number,
  reaction: "like" | "dislike",
  token: string,
) {
  return reelsFetch<{ success: boolean }>(`/videos/${videoId}/react`, {
    method: "POST",
    token,
    body: { userId, reaction },
  });
}

export async function subscribeChannel(channelId: number, userId: number, token: string) {
  return reelsFetch<{ success: boolean }>(`/subscribe/${channelId}`, {
    method: "POST",
    token,
    body: { userId },
  });
}

export async function unsubscribeChannel(channelId: number, userId: number, token: string) {
  return reelsFetch<{ success: boolean }>(`/subscribe/${channelId}?userId=${userId}`, {
    method: "DELETE",
    token,
  });
}

export async function fetchComments(videoId: number, userId: number, token?: string | null) {
  const res = await reelsFetch<{ success: boolean; comments: ReelsComment[] }>(
    `/videos/${videoId}/comments?userId=${userId}&sort=top`,
    { token },
  );
  return res;
}

export async function postComment(
  videoId: number,
  userId: number,
  content: string,
  token: string,
  parentId?: number,
) {
  return reelsFetch<{ success: boolean }>(`/videos/${videoId}/comments`, {
    method: "POST",
    token,
    body: { userId, content, parentId: parentId ?? null },
  });
}

export async function deleteVideo(videoId: number, userId: number, token: string) {
  return reelsFetch<{ success: boolean; message?: string }>(
    `/videos/${videoId}?userId=${userId}`,
    { method: "DELETE", token },
  );
}

type PresignedSlot = {
  uploadsRel: string;
  uploadUrl: string;
  contentType: string;
};

async function putToS3(url: string, file: File, contentType: string, onProgress?: (pct: number) => void) {
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && onProgress) {
        onProgress(Math.min(100, Math.round((ev.loaded / ev.total) * 100)));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Upload network error"));
    xhr.send(file);
  });
}

export async function uploadVideo(opts: {
  userId: number;
  token: string;
  title: string;
  description: string;
  hashtags: string;
  durationSeconds: number;
  videoFile: File;
  thumbnailFile?: File;
  onProgress?: (pct: number) => void;
}) {
  const intent = await reelsFetch<{
    success: boolean;
    directUpload?: boolean;
    video?: PresignedSlot;
    thumbnail?: PresignedSlot | null;
    message?: string;
  }>("/videos/upload-intent", {
    method: "POST",
    token: opts.token,
    body: {
      userId: opts.userId,
      videoContentType: opts.videoFile.type || "video/mp4",
      hasThumbnail: Boolean(opts.thumbnailFile),
      thumbnailContentType: "image/jpeg",
    },
  });

  if (intent.success && intent.directUpload && intent.video?.uploadUrl) {
    await putToS3(
      intent.video.uploadUrl,
      opts.videoFile,
      intent.video.contentType || opts.videoFile.type,
      (p) => opts.onProgress?.(Math.round(p * 0.9)),
    );
    let thumbRel: string | undefined;
    if (opts.thumbnailFile && intent.thumbnail?.uploadUrl) {
      await putToS3(
        intent.thumbnail.uploadUrl,
        opts.thumbnailFile,
        intent.thumbnail.contentType || "image/jpeg",
        (p) => opts.onProgress?.(90 + Math.round(p * 0.08)),
      );
      thumbRel = intent.thumbnail.uploadsRel;
    }
    opts.onProgress?.(98);
    const done = await reelsFetch<{
      success: boolean;
      video?: ReelsVideo;
      message?: string;
      pending?: boolean;
    }>("/videos/complete", {
      method: "POST",
      token: opts.token,
      body: {
        userId: opts.userId,
        title: opts.title,
        description: opts.description,
        hashtags: opts.hashtags,
        durationSeconds: opts.durationSeconds,
        videoUploadsRel: intent.video.uploadsRel,
        thumbnailUploadsRel: thumbRel,
      },
    });
    opts.onProgress?.(100);
    if (done.video) done.video = normalizeVideo(done.video);
    return done;
  }

  const fd = new FormData();
  fd.append("userId", String(opts.userId));
  fd.append("title", opts.title);
  fd.append("description", opts.description);
  fd.append("hashtags", opts.hashtags);
  fd.append("durationSeconds", String(opts.durationSeconds));
  fd.append("video", opts.videoFile);
  if (opts.thumbnailFile) fd.append("thumbnail", opts.thumbnailFile);

  const res = await fetch(`${getApiBase()}/api/reels/videos`, {
    method: "POST",
    headers: authHeaders(opts.token) as Record<string, string>,
    body: fd,
  });
  const json = (await res.json()) as {
    success: boolean;
    video?: ReelsVideo;
    message?: string;
    pending?: boolean;
  };
  if (json.video) json.video = normalizeVideo(json.video);
  opts.onProgress?.(100);
  return json;
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

export function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function timeAgo(iso?: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins || 1} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} mo ago`;
  return `${Math.floor(months / 12)} yr ago`;
}

import * as Linking from "expo-linking";
import { Alert, Clipboard, Platform, Share } from "react-native";
import type { ReelsVideo } from "./reelsApi";
import { shareReelsVideo } from "./reelsApi";
import { VIBE_BRAND_NAME } from "./vibeVideo";

const CHANNEL_HANDLE_RE = /[a-zA-Z][a-zA-Z0-9_]{2,29}/;

function videoPublicBase(): string {
  const domain = process.env.EXPO_PUBLIC_VIDEO_DOMAIN?.trim() || "video.videh.co.in";
  return domain.startsWith("http") ? domain.replace(/\/+$/, "") : `https://${domain}`;
}

function normalizeChannelHandle(handle: string): string {
  return handle.replace(/^@+/, "").trim();
}

/** Parse in-stream video share URL or videh:// deep link → opaque slug (never numeric id). */
export function parseReelsWatchIdFromUrl(url: string): string | null {
  return parseReelsShareUrl(url)?.ref ?? null;
}

/**
 * Parse share URL and return slug + whether the link was a Vibe short-form share.
 * Handles: `/watch/<slug>`, `/v/<slug>`, `/api/reels/go/...`, `videh://reels/watch/...`, `videh://vibe/...`.
 */
export function parseReelsShareUrl(url: string): { ref: string; isVibe: boolean } | null {
  if (!url) return null;
  const slugPattern = "([a-zA-Z0-9_-]{8,24})";
  const numericPattern = "(\\d+)";
  const anyPattern = `(?:${slugPattern}|${numericPattern})`;

  const vibeGoMatch = url.match(new RegExp(`/api/reels/go/v/${slugPattern}`, "i"));
  if (vibeGoMatch?.[1]) return { ref: vibeGoMatch[1], isVibe: true };

  const goMatch = url.match(new RegExp(`/api/reels/go/${anyPattern}`, "i"));
  if (goMatch?.[1] ?? goMatch?.[2]) {
    return { ref: (goMatch[1] ?? goMatch[2])!, isVibe: false };
  }

  const parsed = Linking.parse(url);
  const host = (parsed.hostname ?? "").toLowerCase();
  const path = String(parsed.path ?? "").replace(/^\//, "");
  const parts = path.split("/");

  if (host === "vibe" && parts[0]) return { ref: parts[0], isVibe: true };
  if (host === "reels" && parts[0] === "watch" && parts[1]) return { ref: parts[1], isVibe: false };
  if (host === "reels" && parts[0] === "vibe" && parts[1]) return { ref: parts[1], isVibe: true };

  const vibePathMatch = String(parsed.path ?? url).match(new RegExp(`(?:^|/)vibe/${slugPattern}`, "i"));
  if (vibePathMatch?.[1]) return { ref: vibePathMatch[1], isVibe: true };

  const vibeVMatch = url.match(new RegExp(`/v/${slugPattern}(?:[/?#]|$)`, "i"));
  if (vibeVMatch?.[1]) return { ref: vibeVMatch[1], isVibe: true };

  const watchDeepMatch = String(parsed.path ?? url).match(new RegExp(`reels/watch/${anyPattern}`, "i"));
  if (watchDeepMatch?.[1] ?? watchDeepMatch?.[2]) {
    return { ref: (watchDeepMatch[1] ?? watchDeepMatch[2])!, isVibe: false };
  }

  const watchMatch = url.match(new RegExp(`/watch/${anyPattern}`, "i"));
  if (watchMatch?.[1] ?? watchMatch?.[2]) {
    return { ref: (watchMatch[1] ?? watchMatch[2])!, isVibe: false };
  }

  return null;
}

/** Parse channel share URL or videh:// deep link → @handle (without @). */
export function parseReelsChannelHandleFromUrl(url: string): string | null {
  if (!url) return null;
  const goMatch = url.match(/\/api\/reels\/go\/channel\/([a-zA-Z][a-zA-Z0-9_]{2,29})/i);
  if (goMatch?.[1]) return goMatch[1].toLowerCase();

  const parsed = Linking.parse(url);
  const host = (parsed.hostname ?? "").toLowerCase();
  const path = String(parsed.path ?? "").replace(/^\//, "");

  if (host === "reels") {
    const parts = path.split("/");
    if (parts[0] === "channel" && parts[1] && CHANNEL_HANDLE_RE.test(parts[1])) {
      return parts[1].toLowerCase();
    }
  }

  const deepMatch = url.match(/reels\/channel\/([a-zA-Z][a-zA-Z0-9_]{2,29})/i);
  if (deepMatch?.[1]) return deepMatch[1].toLowerCase();

  const atMatch = url.match(/\/@([a-zA-Z][a-zA-Z0-9_]{2,29})(?:[/?#]|$)/i);
  if (atMatch?.[1]) return atMatch[1].toLowerCase();

  const channelPathMatch = url.match(/\/channel\/([a-zA-Z][a-zA-Z0-9_]{2,29})(?:[/?#]|$)/i);
  if (channelPathMatch?.[1]) return channelPathMatch[1].toLowerCase();

  return null;
}

export function reelsChannelShareUrl(handle: string): string {
  const h = normalizeChannelHandle(handle);
  return `${videoPublicBase()}/@${encodeURIComponent(h)}`;
}

export function reelsChannelShareMessage(channel: {
  handle: string;
  displayName?: string | null;
}): string {
  const label = channel.displayName?.trim() || `@${channel.handle}`;
  const url = reelsChannelShareUrl(channel.handle);
  return `Subscribe to ${label} on Videh Video\n${url}`;
}

export async function shareReelsChannelLink(channel: {
  handle: string;
  displayName?: string | null;
}): Promise<void> {
  const message = reelsChannelShareMessage(channel);
  if (Platform.OS === "web") {
    Clipboard.setString(message);
    Alert.alert("Link copied", "Paste it in chat or status to share your channel.");
    return;
  }
  try {
    await Share.share({ message, title: channel.displayName?.trim() || `@${channel.handle}` });
  } catch {
    Alert.alert("Share channel", message);
  }
}

type ShareRefVideo = Pick<
  ReelsVideo,
  "shareUrl" | "shareSlug" | "vibeShareUrl" | "videoFormat"
>;

function isVibe(video: ShareRefVideo): boolean {
  return video.videoFormat === "vibe" || Boolean(video.vibeShareUrl);
}

/** Build a slug-only URL; never falls back to numeric id. */
function slugUrl(kind: "watch" | "v", slug: string): string {
  return `${videoPublicBase()}/${kind}/${encodeURIComponent(slug)}`;
}

/**
 * Public share URL for a video.
 * - Vibe videos → `/v/<slug>`
 * - Watch (long) videos → `/watch/<slug>`
 * - Never contains numeric video id.
 */
export function reelsShareUrlForVideo(video: ShareRefVideo): string | null {
  if (isVibe(video)) {
    if (video.vibeShareUrl) return video.vibeShareUrl;
    if (video.shareSlug) return slugUrl("v", video.shareSlug);
  }
  if (video.shareUrl) return video.shareUrl;
  if (video.shareSlug) return slugUrl("watch", video.shareSlug);
  return null;
}

export function reelsShareMessage(
  video: Pick<ReelsVideo, "title" | "channelHandle"> & ShareRefVideo,
): string {
  const url = reelsShareUrlForVideo(video);
  const handle = video.channelHandle ? `@${video.channelHandle}` : "";
  const prefix = isVibe(video) ? `${VIBE_BRAND_NAME}: ${video.title}` : video.title;
  return [prefix, handle, url].filter(Boolean).join("\n");
}

export async function copyReelsShareLink(
  video: Pick<ReelsVideo, "title" | "channelHandle"> & ShareRefVideo,
): Promise<void> {
  const message = reelsShareMessage(video);
  Clipboard.setString(message);
  Alert.alert("Link copied", "Paste it in status, chat, or anywhere you want to share.");
}

export async function shareReelsVideoLink(
  video: ReelsVideo,
  userId: number,
  sessionToken?: string | null,
): Promise<void> {
  const res = await shareReelsVideo(video.id, userId, sessionToken).catch(() => ({
    success: false as const,
    shareUrl: undefined,
    watchUrl: undefined,
    vibeShareUrl: undefined,
  }));
  const enriched: ReelsVideo = {
    ...video,
    shareUrl: res.watchUrl ?? video.shareUrl,
    vibeShareUrl: res.vibeShareUrl ?? video.vibeShareUrl,
  };
  const url = reelsShareUrlForVideo(enriched) ?? res.shareUrl;
  if (!url) {
    Alert.alert("Share unavailable", "This video can not be shared right now.");
    return;
  }
  const message = reelsShareMessage(enriched);
  if (Platform.OS === "web") {
    await copyReelsShareLink(enriched);
    return;
  }
  try {
    await Share.share({ message, title: video.title });
  } catch {
    Alert.alert("Share link", message);
  }
}

export function showUploadShareDialog(
  video: ReelsVideo,
  opts: {
    pending?: boolean;
    pendingMessage?: string;
    onWatch: () => void;
    onDone?: () => void;
  },
): void {
  const url = reelsShareUrlForVideo(video);
  const message = reelsShareMessage(video);
  const kind = isVibe(video) ? VIBE_BRAND_NAME : "Video";
  const title = opts.pending ? `${kind} uploaded — under review` : `${kind} uploaded!`;
  const linkBody = url ? `\n\nShare link:\n${url}` : "";
  const body = opts.pending
    ? `${opts.pendingMessage ?? "Your video will go public after safety review."}${linkBody}`
    : url
      ? `Your ${kind.toLowerCase()} link:\n${url}`
      : "Your video is uploaded. Share link will be ready shortly.";

  Alert.alert(title, body, [
    { text: "Copy link", onPress: () => { if (url) Clipboard.setString(message); } },
    {
      text: "Share",
      onPress: () => {
        if (!url) return;
        void Share.share({ message, title: video.title }).catch(() => {
          Clipboard.setString(message);
        });
      },
    },
    { text: opts.pending ? "OK" : (isVibe(video) ? `Open ${VIBE_BRAND_NAME}` : "Watch"), onPress: () => { opts.onWatch(); } },
  ]);
}

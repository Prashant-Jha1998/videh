import * as Linking from "expo-linking";
import { Alert, Clipboard, Platform, Share } from "react-native";
import type { ReelsVideo } from "./reelsApi";
import { shareReelsVideo } from "./reelsApi";

const CHANNEL_HANDLE_RE = /[a-zA-Z][a-zA-Z0-9_]{2,29}/;

function videoPublicBase(): string {
  const domain = process.env.EXPO_PUBLIC_VIDEO_DOMAIN?.trim() || "video.videh.co.in";
  return domain.startsWith("http") ? domain.replace(/\/+$/, "") : `https://${domain}`;
}

function normalizeChannelHandle(handle: string): string {
  return handle.replace(/^@+/, "").trim();
}

/** Parse YouTube-style share URL or videh:// deep link → video id. */
export function parseReelsWatchIdFromUrl(url: string): string | null {
  if (!url) return null;
  const goMatch = url.match(/\/api\/reels\/go\/(\d+)/i);
  if (goMatch?.[1]) return goMatch[1];
  const parsed = Linking.parse(url);
  const host = (parsed.hostname ?? "").toLowerCase();
  if (host === "reels") {
    const parts = String(parsed.path ?? "").replace(/^\//, "").split("/");
    if (parts[0] === "watch" && parts[1]) return parts[1];
  }
  const pathMatch = String(parsed.path ?? url).match(/reels\/watch\/(\d+)/i);
  if (pathMatch?.[1]) return pathMatch[1];
  const watchMatch = url.match(/\/watch\/(\d+)/i);
  if (watchMatch?.[1]) return watchMatch[1];
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

export function reelsShareUrlForVideo(video: Pick<ReelsVideo, "id" | "shareUrl">): string {
  if (video.shareUrl) return video.shareUrl;
  const domain = process.env.EXPO_PUBLIC_DOMAIN ?? "videh.co.in";
  const base = domain.startsWith("http") ? domain.replace(/\/+$/, "") : `https://${domain}`;
  return `${base}/api/reels/go/${video.id}`;
}

export function reelsShareMessage(video: Pick<ReelsVideo, "id" | "title" | "channelHandle" | "shareUrl">): string {
  const url = reelsShareUrlForVideo(video);
  const handle = video.channelHandle ? `@${video.channelHandle}` : "";
  return [video.title, handle, url].filter(Boolean).join("\n");
}

export async function copyReelsShareLink(video: Pick<ReelsVideo, "id" | "title" | "channelHandle" | "shareUrl">): Promise<void> {
  Clipboard.setString(reelsShareMessage(video));
  Alert.alert("Link copied", "Paste it in status, chat, or anywhere you want to share.");
}

export async function shareReelsVideoLink(
  video: ReelsVideo,
  userId: number,
  sessionToken?: string | null,
): Promise<void> {
  const res = await shareReelsVideo(video.id, userId, sessionToken);
  const url = res.shareUrl ?? reelsShareUrlForVideo(video);
  const message = reelsShareMessage({ ...video, shareUrl: url });
  if (Platform.OS === "web") {
    await copyReelsShareLink({ ...video, shareUrl: url });
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
  const title = opts.pending ? "Uploaded — under review" : "Video uploaded!";
  const body = opts.pending
    ? `${opts.pendingMessage ?? "Your video will be public after approval."}\n\nShare link (works when live):\n${url}`
    : `Your video link:\n${url}`;

  Alert.alert(title, body, [
    { text: "Copy link", onPress: () => { Clipboard.setString(message); } },
    {
      text: "Share",
      onPress: () => {
        void Share.share({ message, title: video.title }).catch(() => {
          Clipboard.setString(message);
        });
      },
    },
    { text: opts.pending ? "OK" : "Watch", onPress: () => { opts.onWatch(); } },
  ]);
}

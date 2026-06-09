import * as Linking from "expo-linking";
import { Alert, Clipboard, Platform, Share } from "react-native";
import type { ReelsVideo } from "./reelsApi";
import { shareReelsVideo } from "./reelsApi";

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
  return null;
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

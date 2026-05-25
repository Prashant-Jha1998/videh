import * as FileSystem from "expo-file-system/legacy";
import { authFetchHeaders } from "./authenticatedMedia";
import { resolvePublicAssetUrl } from "./publicAssetUrl";

const CACHE_SUBDIR = "videh_chat_media/";

function stableKey(url: string): string {
  let h = 0;
  for (let i = 0; i < url.length; i++) {
    h = ((h << 5) - h + url.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

function extForImage(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes(".gif") || lower.includes("image/gif")) return "gif";
  if (lower.includes(".png") || lower.includes("image/png")) return "png";
  if (lower.includes(".webp") || lower.includes("image/webp")) return "webp";
  return "jpg";
}

function extForVideo(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes(".mov") || lower.includes("quicktime")) return "mov";
  return "mp4";
}

async function cacheDir(): Promise<string> {
  const base = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? "";
  if (!base) throw new Error("No writable cache directory");
  const dir = `${base}${CACHE_SUBDIR}`;
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  return dir;
}

const inFlight = new Set<string>();

/** Download image to private app cache (not the device gallery). */
export async function cacheChatImageUrl(
  mediaUrl: string,
  sessionToken?: string | null,
): Promise<void> {
  const uri = resolvePublicAssetUrl(mediaUrl) ?? mediaUrl;
  const key = `img_${stableKey(uri)}`;
  if (inFlight.has(key)) return;
  inFlight.add(key);
  try {
    const dir = await cacheDir();
    const target = `${dir}${key}.${extForImage(uri)}`;
    const existing = await FileSystem.getInfoAsync(target);
    if (existing.exists && (existing.size ?? 0) > 0) return;

    if (uri.startsWith("data:image")) {
      const base64 = uri.replace(/^data:[^;]+;base64,/, "");
      await FileSystem.writeAsStringAsync(target, base64, { encoding: FileSystem.EncodingType.Base64 });
      return;
    }
    if (!/^https?:\/\//i.test(uri)) return;

    const headers: Record<string, string> = {};
    if (uri.includes("/api/chats/media/") && sessionToken) {
      Object.assign(headers, (authFetchHeaders(sessionToken) as Record<string, string>) ?? {});
    }
    const res = await FileSystem.downloadAsync(
      uri,
      target,
      Object.keys(headers).length ? { headers } : undefined,
    );
    if (res.status && (res.status < 200 || res.status >= 300)) {
      await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => {});
    }
  } finally {
    inFlight.delete(key);
  }
}

/** Download video to private app cache (not the device gallery). */
export async function cacheChatVideoUrl(
  mediaUrl: string,
  sessionToken?: string | null,
): Promise<void> {
  const uri = resolvePublicAssetUrl(mediaUrl) ?? mediaUrl;
  const key = `vid_${stableKey(uri)}`;
  if (inFlight.has(key)) return;
  inFlight.add(key);
  try {
    const dir = await cacheDir();
    const target = `${dir}${key}.${extForVideo(uri)}`;
    const existing = await FileSystem.getInfoAsync(target);
    if (existing.exists && (existing.size ?? 0) > 0) return;

    if (uri.startsWith("data:video")) {
      const base64 = uri.replace(/^data:[^;]+;base64,/, "");
      await FileSystem.writeAsStringAsync(target, base64, { encoding: FileSystem.EncodingType.Base64 });
      return;
    }
    if (!/^https?:\/\//i.test(uri)) return;

    const headers: Record<string, string> = {};
    if (uri.includes("/api/chats/media/") && sessionToken) {
      Object.assign(headers, (authFetchHeaders(sessionToken) as Record<string, string>) ?? {});
    }
    const res = await FileSystem.downloadAsync(
      uri,
      target,
      Object.keys(headers).length ? { headers } : undefined,
    );
    if (res.status && (res.status < 200 || res.status >= 300)) {
      await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => {});
    }
  } finally {
    inFlight.delete(key);
  }
}

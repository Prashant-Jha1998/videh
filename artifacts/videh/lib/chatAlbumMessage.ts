import { resolvePublicAssetUrl } from "@/lib/publicAssetUrl";
import { ensureUploadableFileUri } from "@/lib/prepareFileUpload";

export type ChatAlbumPayload = {
  urls: string[];
  caption?: string;
};

export function normalizeAlbumMediaUrl(url: string): string {
  const raw = url.trim();
  if (!raw) return raw;
  return resolvePublicAssetUrl(raw) ?? raw;
}

export function normalizeAlbumUrlList(urls: string[] | undefined): string[] | undefined {
  if (!urls?.length) return undefined;
  const clean = urls.map(normalizeAlbumMediaUrl).filter(Boolean);
  return clean.length > 0 ? clean : undefined;
}

export function encodeAlbumMessageContent(urls: string[], caption?: string): string {
  const clean = urls.map((u) => u.trim()).filter(Boolean);
  const cap = caption?.trim();
  return JSON.stringify({
    urls: clean,
    ...(cap ? { caption: cap } : {}),
  } satisfies ChatAlbumPayload);
}

export function parseAlbumMessageContent(content: string | undefined | null): ChatAlbumPayload | null {
  const raw = String(content ?? "").trim();
  if (!raw.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(raw) as ChatAlbumPayload;
    if (!Array.isArray(parsed.urls) || parsed.urls.length < 2) return null;
    const urls = normalizeAlbumUrlList(parsed.urls.map((u) => String(u).trim()).filter(Boolean));
    if (!urls || urls.length < 2) return null;
    return {
      urls,
      caption: parsed.caption?.trim() || undefined,
    };
  } catch {
    return null;
  }
}

export function albumChatPreview(count: number, caption?: string): string {
  if (caption?.trim()) return caption.trim();
  return count === 1 ? "Photo" : `${count} photos`;
}

/** Push/FCM body like "4 photos" — not full album JSON. */
export function parseAlbumPhotoCountLabel(text: string | undefined | null): number | null {
  const m = String(text ?? "").trim().match(/^(\d+)\s+photos?$/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 2 ? n : null;
}

/** Best available URL list for rendering an album bubble. */
export function resolveAlbumUrls(
  content: string | undefined | null,
  opts?: { albumUrls?: string[]; mediaUrl?: string | null },
): string[] | undefined {
  const parsed = parseAlbumMessageContent(content);
  const lists: string[][] = [];
  if (opts?.albumUrls?.length) lists.push(normalizeAlbumUrlList(opts.albumUrls) ?? []);
  if (parsed?.urls?.length) lists.push(parsed.urls);
  if (opts?.mediaUrl?.trim()) lists.push([normalizeAlbumMediaUrl(opts.mediaUrl)]);
  if (lists.length === 0) return undefined;
  const best = lists.reduce((a, b) => (b.length > a.length ? b : a));
  return best.length >= 2 ? best : undefined;
}

/** Prefer local picker URIs until the server message is confirmed (remote may 403 before DB write). */
export function displayAlbumUrls(msg: {
  albumUrls?: string[];
  albumLocalUrls?: string[];
  uploadProgress?: number;
  uploadFailed?: boolean;
  id?: string;
}): string[] {
  const remote = msg.albumUrls ?? [];
  const local = msg.albumLocalUrls ?? [];
  const len = Math.max(remote.length, local.length);
  if (len === 0) return [];
  const stillUploading =
    !msg.uploadFailed
    && (
      (typeof msg.uploadProgress === "number" && msg.uploadProgress < 100)
      || (msg.id?.startsWith("tmp_") && local.length > 0)
    );
  const out: string[] = [];
  for (let i = 0; i < len; i++) {
    const pick = (stillUploading ? (local[i] || remote[i]) : (remote[i] || local[i]) || "").trim();
    if (pick) out.push(pick);
  }
  return out;
}

/** Copy content:// / ph:// URIs to file:// so chat bubbles can preview while uploading. */
export async function ensureAlbumDisplayUris(uris: string[]): Promise<string[]> {
  return Promise.all(
    uris.map(async (uri, index) => {
      const raw = uri.trim();
      if (!raw) return raw;
      if (
        raw.startsWith("file://")
        || raw.startsWith("http://")
        || raw.startsWith("https://")
        || raw.startsWith("data:")
      ) {
        return raw;
      }
      try {
        return await ensureUploadableFileUri(raw, `album_preview_${index}.jpg`);
      } catch {
        return raw;
      }
    }),
  );
}

export function isAlbumMessage(
  declaredType: string | undefined | null,
  content: string | undefined | null,
  opts?: { albumUrls?: string[]; mediaUrl?: string | null },
): boolean {
  if (String(declaredType ?? "").toLowerCase() === "album") return !!resolveAlbumUrls(content, opts);
  if (parseAlbumMessageContent(content)) return true;
  return !!opts?.albumUrls && opts.albumUrls.length >= 2;
}

/** Human-readable bubble text — never raw `{"urls":[...]}` JSON. */
export function albumMessageDisplayText(
  content: string | undefined | null,
  urlCount?: number,
): string {
  const parsed = parseAlbumMessageContent(content);
  if (parsed) return parsed.caption ?? albumChatPreview(parsed.urls.length);
  if (urlCount != null && urlCount >= 2) return albumChatPreview(urlCount);
  return "";
}

/** Caption shown under an album grid (null = hide). */
export function albumBubbleCaptionText(
  text: string | undefined | null,
  urlCount: number,
): string | null {
  const parsed = parseAlbumMessageContent(text);
  const cap = parsed?.caption?.trim()
    ?? (parsed ? "" : (text?.trim() && !text.trim().startsWith("{") ? text.trim() : ""));
  if (!cap) return null;
  const defaultLabel = albumChatPreview(urlCount);
  if (cap === defaultLabel || cap === "Photo") return null;
  return cap;
}

/** Fix album rows loaded from SSE hints or stale cache. */
export function coerceAlbumMessageFields<T extends {
  text: string;
  type: string;
  mediaUrl?: string;
  albumUrls?: string[];
}>(msg: T): T {
  const urls = resolveAlbumUrls(msg.text, { albumUrls: msg.albumUrls, mediaUrl: msg.mediaUrl });
  if (!urls || urls.length < 2) return msg;
  const display = albumMessageDisplayText(msg.text, urls.length);
  return {
    ...msg,
    type: "album",
    text: display || albumChatPreview(urls.length),
    albumUrls: urls,
    mediaUrl: urls[0] ?? msg.mediaUrl,
  };
}

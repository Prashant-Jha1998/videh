import { resolvePublicAssetUrl } from "@/lib/publicAssetUrl";

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

/** Prefer remote URL per tile, fall back to local picker URI while uploading. */
export function displayAlbumUrls(msg: {
  albumUrls?: string[];
  albumLocalUrls?: string[];
}): string[] {
  const remote = msg.albumUrls ?? [];
  const local = msg.albumLocalUrls ?? [];
  const len = Math.max(remote.length, local.length);
  if (len === 0) return [];
  const out: string[] = [];
  for (let i = 0; i < len; i++) {
    const pick = (remote[i] || local[i] || "").trim();
    if (pick) out.push(pick);
  }
  return out;
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

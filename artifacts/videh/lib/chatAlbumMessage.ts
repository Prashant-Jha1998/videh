export type ChatAlbumPayload = {
  urls: string[];
  caption?: string;
};

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
    const urls = parsed.urls.map((u) => String(u).trim()).filter(Boolean);
    if (urls.length < 2) return null;
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
  if (opts?.albumUrls?.length) lists.push(opts.albumUrls.map((u) => u.trim()).filter(Boolean));
  if (parsed?.urls?.length) lists.push(parsed.urls);
  if (opts?.mediaUrl?.trim()) lists.push([opts.mediaUrl.trim()]);
  if (lists.length === 0) return undefined;
  const best = lists.reduce((a, b) => (b.length > a.length ? b : a));
  return best.length >= 2 ? best : undefined;
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

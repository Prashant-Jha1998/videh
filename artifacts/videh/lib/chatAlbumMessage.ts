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

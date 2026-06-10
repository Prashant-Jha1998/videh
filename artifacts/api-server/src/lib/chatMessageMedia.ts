import type { Request } from "express";
import { resolveStoredMediaUrl } from "./mediaStorage";

function resolveStoredUrl(req: Request, url: unknown): string | null {
  const raw = String(url ?? "").trim();
  if (!raw) return null;
  return resolveStoredMediaUrl(req, raw) ?? raw;
}

/** Resolve album JSON `urls` to public CDN/API URLs for clients. */
export function resolveAlbumMessageContent(req: Request, content: string | null | undefined): string {
  const raw = String(content ?? "").trim();
  if (!raw.startsWith("{")) return raw;
  try {
    const parsed = JSON.parse(raw) as { urls?: unknown[]; caption?: string };
    if (!Array.isArray(parsed.urls) || parsed.urls.length === 0) return raw;
    const urls = parsed.urls
      .map((u) => resolveStoredUrl(req, u))
      .filter((u): u is string => Boolean(u));
    if (urls.length === 0) return raw;
    return JSON.stringify({ ...parsed, urls });
  } catch {
    return raw;
  }
}

/** Normalize media_url + album content URLs before sending messages to clients. */
export function resolveChatMessageRowForClient(req: Request, row: Record<string, unknown>): Record<string, unknown> {
  const type = String(row.type ?? "").toLowerCase();
  const mediaUrlRaw = row.media_url;
  const media_url = mediaUrlRaw != null && mediaUrlRaw !== ""
    ? resolveStoredUrl(req, mediaUrlRaw)
    : mediaUrlRaw;

  let content = row.content;
  if (type === "album" || (typeof content === "string" && content.trim().startsWith("{") && content.includes('"urls"'))) {
    content = resolveAlbumMessageContent(req, typeof content === "string" ? content : "");
  }

  return { ...row, media_url, content };
}

import { extractStatusMediaFilename } from "./statusMediaPath";

/** Map protected chat/status media URLs to web-session authenticated proxy. */
export function resolveWebMediaFetchUrl(mediaUrl: string, webSessionToken: string | null): string {
  if (!webSessionToken) return mediaUrl;

  const chatMatch = mediaUrl.match(/\/api\/chats\/media\/([^?#]+)/);
  if (chatMatch) {
    const filename = decodeURIComponent(chatMatch[1]);
    return `/api/web-session/${encodeURIComponent(webSessionToken)}/media/${encodeURIComponent(filename)}`;
  }

  const statusFile = extractStatusMediaFilename(mediaUrl);
  if (statusFile) {
    return `/api/web-session/${encodeURIComponent(webSessionToken)}/statuses/media/${encodeURIComponent(statusFile)}`;
  }

  return mediaUrl;
}

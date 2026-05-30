/** Map protected chat media URLs to web-session authenticated proxy. */
export function resolveWebMediaFetchUrl(mediaUrl: string, webSessionToken: string | null): string {
  if (!webSessionToken) return mediaUrl;
  const match = mediaUrl.match(/\/api\/chats\/media\/([^?#]+)/);
  if (!match) return mediaUrl;
  const filename = decodeURIComponent(match[1]);
  return `/api/web-session/${encodeURIComponent(webSessionToken)}/media/${encodeURIComponent(filename)}`;
}

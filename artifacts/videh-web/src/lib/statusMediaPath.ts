/** Mirror of API status media path parsing for browser clients. */
export function extractStatusMediaFilename(mediaUrl: unknown): string | null {
  const raw = String(mediaUrl ?? "").trim();
  if (!raw) return null;
  try {
    const pathPart = raw.includes("://") ? new URL(raw).pathname : raw.split("?")[0] ?? raw;
    const marker = "/api/statuses/media/";
    const idx = pathPart.indexOf(marker);
    if (idx < 0) return null;
    let rest = pathPart.slice(idx + marker.length).replace(/\/+$/, "");
    if (rest.endsWith("/content")) {
      rest = rest.slice(0, -"/content".length).replace(/\/+$/, "");
    }
    if (!rest) return null;
    return decodeURIComponent(rest);
  } catch {
    return null;
  }
}

/** Extract http(s) URLs from chat text (composer + bubbles). */
export function extractUrls(text: string): string[] {
  const urlRegex = /(https?:\/\/[^\s<>"']+)/gi;
  return text.match(urlRegex) ?? [];
}

export function primaryUrlFromText(text: string): string | null {
  const urls = extractUrls(text);
  return urls[0] ?? null;
}

export function linkPreviewHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

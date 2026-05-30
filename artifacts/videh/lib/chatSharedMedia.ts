import { getApiUrl } from "@/lib/api";
import { extractUrls } from "@/lib/chatUrls";
import { normalizeMessageType } from "@/lib/normalizeMessage";

export type SharedMediaItem = {
  id: string;
  kind: "image" | "video" | "document" | "link";
  mediaUrl?: string;
  content: string;
  timestamp: number;
  senderName?: string;
  senderId?: string;
};

export type SharedMediaBuckets = {
  media: SharedMediaItem[];
  docs: SharedMediaItem[];
  links: SharedMediaItem[];
};

function isLinkOnlyMessage(type: string, content: string): boolean {
  if (type === "deleted") return false;
  const urls = extractUrls(content);
  if (urls.length === 0) return false;
  const stripped = content.replace(/https?:\/\/\S+/gi, "").trim();
  return stripped.length < 4;
}

export function bucketSharedMediaFromRows(rows: Array<Record<string, unknown>>): SharedMediaBuckets {
  const media: SharedMediaItem[] = [];
  const docs: SharedMediaItem[] = [];
  const links: SharedMediaItem[] = [];
  const linkSeen = new Set<string>();

  for (const m of rows) {
    if (m.is_deleted) continue;
    const content = String(m.content ?? "");
    const mediaUrl = m.media_url ? String(m.media_url) : undefined;
    const type = normalizeMessageType(String(m.type ?? "text"), content, mediaUrl);
    const base = {
      id: String(m.id),
      content,
      timestamp: new Date(String(m.created_at)).getTime(),
      senderName: m.sender_name ? String(m.sender_name) : undefined,
      senderId: m.sender_id != null ? String(m.sender_id) : undefined,
      mediaUrl,
    };

    if (type === "image" || type === "video") {
      if (mediaUrl) media.push({ ...base, kind: type });
      continue;
    }
    if (type === "document" && mediaUrl) {
      docs.push({ ...base, kind: "document" });
      continue;
    }
    if (isLinkOnlyMessage(type, content)) {
      for (const url of extractUrls(content)) {
        if (linkSeen.has(url)) continue;
        linkSeen.add(url);
        links.push({ ...base, id: `${base.id}-${url}`, kind: "link", content: url });
      }
    } else {
      for (const url of extractUrls(content)) {
        if (linkSeen.has(url)) continue;
        linkSeen.add(url);
        links.push({ ...base, id: `${base.id}-${url}`, kind: "link", content: url });
      }
    }
  }

  const byTime = (a: SharedMediaItem, b: SharedMediaItem) => b.timestamp - a.timestamp;
  return {
    media: media.sort(byTime),
    docs: docs.sort(byTime),
    links: links.sort(byTime),
  };
}

export async function fetchChatSharedMedia(
  chatId: string,
  userId: number,
  sessionToken?: string | null,
  limit = 400,
): Promise<SharedMediaBuckets> {
  const headers: Record<string, string> = {};
  if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;
  const res = await fetch(
    `${getApiUrl()}/api/chats/${chatId}/messages?limit=${limit}&userId=${userId}`,
    { headers },
  );
  const data = (await res.json()) as { success?: boolean; messages?: Array<Record<string, unknown>> };
  if (!data.success || !data.messages) {
    return { media: [], docs: [], links: [] };
  }
  return bucketSharedMediaFromRows(data.messages);
}

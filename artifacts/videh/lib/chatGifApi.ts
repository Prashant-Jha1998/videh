import { getApiUrl } from "@/lib/api";

export type GifMediaItem = {
  id: string;
  previewUrl: string;
  stillUrl?: string;
  gifUrl?: string;
  sendUrl: string;
  width: number;
  height: number;
};

const BASE = getApiUrl();

export const GIF_QUICK_CATEGORIES: { label: string; emoji: string; query: string }[] = [
  { label: "Hi", emoji: "👋", query: "hello wave hi" },
  { label: "Haha", emoji: "😂", query: "funny laugh haha" },
  { label: "Love", emoji: "❤️", query: "love heart" },
  { label: "Sad", emoji: "😢", query: "sad cry" },
  { label: "Wow", emoji: "😲", query: "wow surprised" },
  { label: "Yay", emoji: "🥳", query: "celebration party yay" },
];

/** Ensure every tile has a JPG fallback even if API omits stillUrl (older server builds). */
function enrichGifItems(items: GifMediaItem[]): GifMediaItem[] {
  return items.map((item) => {
    if (item.stillUrl?.startsWith("https://")) return item;
    const idMatch = item.previewUrl.match(/\/media\/([^/]+)\//) ?? item.sendUrl.match(/\/media\/([^/]+)\//);
    if (!idMatch?.[1]) return item;
    const stillUrl = `https://media.giphy.com/media/${idMatch[1]}/200w.jpg`;
    const gifUrl = item.gifUrl ?? `https://media.giphy.com/media/${idMatch[1]}/200w.gif`;
    return { ...item, stillUrl, gifUrl };
  });
}

async function fetchGifPath(path: string): Promise<GifMediaItem[]> {
  const res = await fetch(`${BASE}${path}`);
  const data = (await res.json()) as { success?: boolean; items?: GifMediaItem[] };
  if (!data.success || !Array.isArray(data.items)) return [];
  return enrichGifItems(data.items);
}

export function fetchTrendingGifs(): Promise<GifMediaItem[]> {
  return fetchGifPath("/api/gifs/trending");
}

export function searchGifs(q: string): Promise<GifMediaItem[]> {
  return fetchGifPath(`/api/gifs/search?q=${encodeURIComponent(q)}`);
}

export function fetchTrendingStickers(): Promise<GifMediaItem[]> {
  return fetchGifPath("/api/gifs/stickers/trending");
}

export function searchStickers(q: string): Promise<GifMediaItem[]> {
  return fetchGifPath(`/api/gifs/stickers/search?q=${encodeURIComponent(q)}`);
}

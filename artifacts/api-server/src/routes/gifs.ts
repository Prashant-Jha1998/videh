import { Router, type IRouter } from "express";

const router: IRouter = Router();

/** Set `GIPHY_API_KEY` in api-server env for production; beta key is rate-limited. */
const GIPHY_KEY = (process.env.GIPHY_API_KEY ?? "dc6zaTOxFJmzC").trim();
const GIPHY_BASE = "https://api.giphy.com/v1";

export type GifMediaItem = {
  id: string;
  previewUrl: string;
  sendUrl: string;
  width: number;
  height: number;
};

const FALLBACK_GIFS: GifMediaItem[] = [
  { id: "fb1", previewUrl: "https://media.giphy.com/media/ICOgUNjpvO0Y/giphy-downsized.gif", sendUrl: "https://media.giphy.com/media/ICOgUNjpvO0Y/giphy.gif", width: 480, height: 270 },
  { id: "fb2", previewUrl: "https://media.giphy.com/media/l0MYC0LajboP2A4Ba/giphy-downsized.gif", sendUrl: "https://media.giphy.com/media/l0MYC0LajboP2A4Ba/giphy.gif", width: 480, height: 270 },
  { id: "fb3", previewUrl: "https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy-downsized.gif", sendUrl: "https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif", width: 480, height: 270 },
  { id: "fb4", previewUrl: "https://media.giphy.com/media/26BRuo6s9kzz2u0Vy/giphy-downsized.gif", sendUrl: "https://media.giphy.com/media/26BRuo6s9kzz2u0Vy/giphy.gif", width: 480, height: 270 },
  { id: "fb5", previewUrl: "https://media.giphy.com/media/3o6Zt481isNVuBI1Qk/giphy-downsized.gif", sendUrl: "https://media.giphy.com/media/3o6Zt481isNVuBI1Qk/giphy.gif", width: 480, height: 270 },
  { id: "fb6", previewUrl: "https://media.giphy.com/media/l3q2K5jinAlChoCLS/giphy-downsized.gif", sendUrl: "https://media.giphy.com/media/l3q2K5jinAlChoCLS/giphy.gif", width: 480, height: 270 },
];

function mapGiphyData(data: unknown): GifMediaItem[] {
  if (!Array.isArray(data)) return [];
  const out: GifMediaItem[] = [];
  for (const row of data) {
    if (!row || typeof row !== "object") continue;
    const item = row as {
      id?: string;
      images?: Record<string, { url?: string; width?: string; height?: string }>;
    };
    const id = String(item.id ?? "");
    const images = item.images ?? {};
    const preview = images.fixed_width_small ?? images.preview_gif ?? images.fixed_width;
    const send = images.downsized_medium ?? images.downsized ?? images.original;
    const previewUrl = preview?.url?.trim();
    const sendUrl = send?.url?.trim();
    if (!id || !previewUrl || !sendUrl) continue;
    out.push({
      id,
      previewUrl,
      sendUrl,
      width: Number(preview.width ?? send.width ?? 200) || 200,
      height: Number(preview.height ?? send.height ?? 200) || 200,
    });
  }
  return out;
}

async function giphyFetch(path: string, params: Record<string, string>): Promise<GifMediaItem[]> {
  const url = new URL(`${GIPHY_BASE}${path}`);
  url.searchParams.set("api_key", GIPHY_KEY);
  url.searchParams.set("limit", params.limit ?? "24");
  url.searchParams.set("rating", "pg");
  for (const [k, v] of Object.entries(params)) {
    if (k !== "limit") url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`Giphy ${res.status}`);
  const json = (await res.json()) as { data?: unknown };
  const mapped = mapGiphyData(json.data);
  if (mapped.length === 0) throw new Error("empty");
  return mapped;
}

router.get("/gifs/trending", async (_req, res) => {
  try {
    const items = await giphyFetch("/gifs/trending", { limit: "24" });
    res.json({ success: true, items });
  } catch {
    res.json({ success: true, items: FALLBACK_GIFS, fallback: true });
  }
});

router.get("/gifs/search", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (!q) {
    res.status(400).json({ success: false, message: "q required" });
    return;
  }
  try {
    const items = await giphyFetch("/gifs/search", { q, limit: "24" });
    res.json({ success: true, items });
  } catch {
    res.json({ success: true, items: FALLBACK_GIFS, fallback: true });
  }
});

router.get("/gifs/stickers/trending", async (_req, res) => {
  try {
    const items = await giphyFetch("/stickers/trending", { limit: "24" });
    res.json({ success: true, items });
  } catch {
    res.json({ success: true, items: FALLBACK_GIFS.slice(0, 6), fallback: true });
  }
});

router.get("/gifs/stickers/search", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (!q) {
    res.status(400).json({ success: false, message: "q required" });
    return;
  }
  try {
    const items = await giphyFetch("/stickers/search", { q, limit: "24" });
    res.json({ success: true, items });
  } catch {
    res.json({ success: true, items: FALLBACK_GIFS.slice(0, 6), fallback: true });
  }
});

export default router;

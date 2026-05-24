import { Router, type IRouter } from "express";

const router: IRouter = Router();

/** Set `GIPHY_API_KEY` in api-server env for production. */
const GIPHY_KEY = (process.env.GIPHY_API_KEY ?? "dc6zaTOxFJmzC").trim();
const GIPHY_BASE = "https://api.giphy.com/v1";

export type GifMediaItem = {
  id: string;
  /** Best URL for grid thumbnail (still JPG/WebP or small GIF). */
  previewUrl: string;
  /** Static JPG fallback when animated preview fails on device. */
  stillUrl?: string;
  /** Small animated GIF (optional). */
  gifUrl?: string;
  sendUrl: string;
  width: number;
  height: number;
};

type GiphyImage = { url?: string; width?: string; height?: string };

const FALLBACK_GIFS: GifMediaItem[] = [
  mk("ICOgUNjpvO0Y", 480, 270),
  mk("l0MYC0LajboP2A4Ba", 480, 270),
  mk("3o7abKhOpu0NwenH3O", 480, 270),
  mk("26BRuo6s9kzz2u0Vy", 480, 270),
  mk("3o6Zt481isNVuBI1Qk", 480, 270),
  mk("l3q2K5jinAlChoCLS", 480, 270),
  mk("13CoYiaw05zzae", 480, 270),
  mk("xT9IgG50Fb7Mi0prBC", 480, 270),
  mk("3o7aD2saalBwwftBIY", 480, 270),
];

function mk(id: string, w: number, h: number): GifMediaItem {
  const base = `https://media.giphy.com/media/${id}`;
  return {
    id,
    previewUrl: `${base}/200w.gif`,
    stillUrl: `${base}/200w.jpg`,
    gifUrl: `${base}/200w.gif`,
    sendUrl: `${base}/giphy.gif`,
    width: w,
    height: h,
  };
}

function https(url: string | undefined): string | undefined {
  const u = url?.trim();
  if (!u) return undefined;
  return u.startsWith("http://") ? u.replace("http://", "https://") : u;
}

function pickImage(...candidates: (GiphyImage | undefined)[]): GiphyImage | undefined {
  for (const c of candidates) {
    if (c?.url?.trim()) return c;
  }
  return undefined;
}

/** Build mobile-safe preview URLs (still JPG first, then small GIF). */
function mapGiphyData(data: unknown): GifMediaItem[] {
  if (!Array.isArray(data)) return [];
  const out: GifMediaItem[] = [];
  for (const row of data) {
    if (!row || typeof row !== "object") continue;
    const item = row as { id?: string; images?: Record<string, GiphyImage> };
    const id = String(item.id ?? "");
    const img = item.images ?? {};
    if (!id) continue;

    const still = pickImage(img.fixed_width_still, img.preview_webp, img.downsized_still);
    const previewGif = pickImage(img.preview_gif, img.downsized_small, img.fixed_width_downsampled);
    const fixedW = pickImage(img.fixed_width, img.fixed_width_small);
    const send = pickImage(img.downsized_medium, img.downsized, img.original);

    const stillUrl = https(still?.url);
    const gifUrl = https(previewGif?.url);
    const fixedUrl = https(fixedW?.url);
    const sendUrl = https(send?.url);

    const previewUrl = stillUrl ?? gifUrl ?? fixedUrl;
    if (!previewUrl || !sendUrl) {
      const fb = mk(id, 200, 200);
      out.push(fb);
      continue;
    }

    out.push({
      id,
      previewUrl,
      stillUrl: stillUrl ?? undefined,
      gifUrl: gifUrl ?? fixedUrl ?? undefined,
      sendUrl,
      width: Number(still?.width ?? previewGif?.width ?? 200) || 200,
      height: Number(still?.height ?? previewGif?.height ?? 200) || 200,
    });
  }
  return out;
}

async function giphyFetch(path: string, params: Record<string, string>): Promise<GifMediaItem[]> {
  const url = new URL(`${GIPHY_BASE}${path}`);
  url.searchParams.set("api_key", GIPHY_KEY);
  url.searchParams.set("limit", params.limit ?? "30");
  url.searchParams.set("rating", "pg");
  for (const [k, v] of Object.entries(params)) {
    if (k !== "limit") url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`Giphy ${res.status}`);
  const json = (await res.json()) as { data?: unknown; meta?: { status?: number; msg?: string } };
  if (json.meta?.status && json.meta.status !== 200) {
    throw new Error(json.meta.msg ?? "giphy error");
  }
  const mapped = mapGiphyData(json.data);
  if (mapped.length === 0) throw new Error("empty");
  return mapped;
}

router.get("/gifs/trending", async (_req, res) => {
  try {
    const items = await giphyFetch("/gifs/trending", { limit: "30" });
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
    const items = await giphyFetch("/gifs/search", { q, limit: "30" });
    res.json({ success: true, items });
  } catch {
    res.json({ success: true, items: FALLBACK_GIFS, fallback: true });
  }
});

router.get("/gifs/stickers/trending", async (_req, res) => {
  try {
    const items = await giphyFetch("/stickers/trending", { limit: "30" });
    res.json({ success: true, items });
  } catch {
    res.json({ success: true, items: FALLBACK_GIFS, fallback: true });
  }
});

router.get("/gifs/stickers/search", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (!q) {
    res.status(400).json({ success: false, message: "q required" });
    return;
  }
  try {
    const items = await giphyFetch("/stickers/search", { q, limit: "30" });
    res.json({ success: true, items });
  } catch {
    res.json({ success: true, items: FALLBACK_GIFS, fallback: true });
  }
});

export default router;

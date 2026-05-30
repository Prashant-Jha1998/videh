import { Router, type Request, type Response } from "express";

const router = Router();

function metaContent(html: string, key: string): string | undefined {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${key}["'][^>]+content=["']([^"']+)`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${key}["']`, "i"),
    new RegExp(`<meta[^>]+name=["']${key}["'][^>]+content=["']([^"']+)`, "i"),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return undefined;
}

function titleFromHtml(html: string): string | undefined {
  return metaContent(html, "og:title")
    ?? metaContent(html, "twitter:title")
    ?? html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
}

router.get("/link-preview", async (req: Request, res: Response) => {
  const raw = String(req.query.url ?? "").trim();
  if (!raw.startsWith("http://") && !raw.startsWith("https://")) {
    res.status(400).json({ success: false, message: "Invalid URL" });
    return;
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    const response = await fetch(raw, {
      signal: controller.signal,
      headers: { "User-Agent": "VidehLinkPreview/1.0", Accept: "text/html" },
      redirect: "follow",
    });
    clearTimeout(timer);
    if (!response.ok) {
      res.json({ success: true, preview: { url: raw } });
      return;
    }
    const html = await response.text();
    const title = titleFromHtml(html);
    const description = metaContent(html, "og:description") ?? metaContent(html, "description");
    let imageUrl = metaContent(html, "og:image") ?? metaContent(html, "twitter:image");
    if (imageUrl?.startsWith("/")) {
      try {
        imageUrl = new URL(imageUrl, raw).href;
      } catch {
        /* ignore */
      }
    }
    res.json({
      success: true,
      preview: {
        url: raw,
        ...(title ? { title } : {}),
        ...(description ? { description } : {}),
        ...(imageUrl ? { imageUrl } : {}),
      },
    });
  } catch {
    res.json({ success: true, preview: { url: raw } });
  }
});

export default router;

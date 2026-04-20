import { Router, type Request, type Response } from "express";

const router = Router();

// Translate text using Google Translate (unofficial free API)
router.post("/", async (req: Request, res: Response) => {
  const { text, to, from = "auto" } = req.body as { text?: string; to?: string; from?: string };
  if (!text || !to) {
    res.status(400).json({ success: false, message: "text and to are required" });
    return;
  }
  try {
    // Use Google Translate free endpoint
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(text)}`;
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!response.ok) throw new Error(`Translate API returned ${response.status}`);
    const data = await response.json() as any;
    // Google returns array of arrays — flatten to get translated text
    const translated = (data[0] as any[][]).map((part: any[]) => part[0]).join("");
    const detectedLang = data[2] as string;
    res.json({ success: true, translated, detectedLang });
  } catch (err) {
    req.log.error({ err }, "translate error");
    res.status(500).json({ success: false, message: "Translation failed" });
  }
});

export default router;

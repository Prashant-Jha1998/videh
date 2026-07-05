import { Router, type Request, type Response } from "express";
import { assertSameUser, getAuthUserId } from "../lib/auth";
import {
  LANG_DISPLAY_NAMES,
  SUPPORTED_TRANSLATE_LANGS,
  normalizeLangCode,
  shouldDisplayGroupTranslation,
  translateText,
} from "../lib/translationService";

const router = Router();

router.get("/languages", (_req: Request, res: Response) => {
  res.json({
    success: true,
    languages: SUPPORTED_TRANSLATE_LANGS.map((code) => ({
      code,
      name: LANG_DISPLAY_NAMES[code] ?? code,
    })),
  });
});

router.post("/", async (req: Request, res: Response) => {
  const authUserId = getAuthUserId(req);
  if (!authUserId) {
    res.status(401).json({ success: false, message: "Authentication required" });
    return;
  }
  const { text, to, from = "auto", messageId } = req.body as {
    text?: string;
    to?: string;
    from?: string;
    messageId?: number;
  };
  if (!text?.trim() || !to) {
    res.status(400).json({ success: false, message: "text and to are required" });
    return;
  }
  if (text.length > 8000) {
    res.status(400).json({ success: false, message: "Text too long to translate" });
    return;
  }
  try {
    const result = await translateText(text.trim(), to, {
      from,
      messageId: messageId && authUserId ? Number(messageId) : undefined,
    });
    res.json({
      success: true,
      translated: result.translated,
      detectedLang: result.sourceLang,
      skipped: result.skipped,
      reason: result.reason,
    });
  } catch (err) {
    req.log.error({ err }, "translate error");
    res.status(500).json({ success: false, message: "Translation failed" });
  }
});

/** Batch translate (authenticated) — used for realtime message hints. */
router.post("/batch", async (req: Request, res: Response) => {
  const { userId, targetLang, items } = req.body as {
    userId?: number;
    targetLang?: string;
    items?: Array<{ messageId?: number; text: string }>;
  };
  if (!userId || !targetLang || !items?.length) {
    res.status(400).json({ success: false });
    return;
  }
  if (!assertSameUser(req, res, userId)) return;
  if (items.length > 50) {
    res.status(400).json({ success: false, message: "Too many items" });
    return;
  }
  try {
    const lang = normalizeLangCode(targetLang);
    const results: Array<{ index: number; translated: string; sourceLang: string; skipped: boolean }> = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const source = item.text.trim();
      const r = await translateText(source, lang, {
        messageId: item.messageId,
      });
      const display = shouldDisplayGroupTranslation(source, r, lang);
      results.push({
        index: i,
        translated: display ? r.translated : source,
        sourceLang: r.sourceLang,
        skipped: !display,
      });
    }
    res.json({ success: true, results, targetLang: lang });
  } catch (err) {
    req.log.error({ err }, "translate batch error");
    res.status(500).json({ success: false });
  }
});

export default router;

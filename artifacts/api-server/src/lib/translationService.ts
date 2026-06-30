import crypto from "node:crypto";
import { translate } from "@vitalets/google-translate-api";
import { query } from "./db";

/** Indian + English language codes supported for group auto-translate. */
export const SUPPORTED_TRANSLATE_LANGS = [
  "en", "hi", "bn", "te", "mr", "ta", "gu", "kn", "pa", "ur", "ml", "or", "as",
] as const;

export type TranslateLang = (typeof SUPPORTED_TRANSLATE_LANGS)[number];

export const LANG_DISPLAY_NAMES: Record<string, string> = {
  en: "English",
  hi: "Hindi",
  bn: "Bengali",
  te: "Telugu",
  mr: "Marathi",
  ta: "Tamil",
  gu: "Gujarati",
  kn: "Kannada",
  pa: "Punjabi",
  ur: "Urdu",
  ml: "Malayalam",
  or: "Odia",
  as: "Assamese",
};

let tablesEnsured = false;

export async function ensureTranslationTables(): Promise<void> {
  if (tablesEnsured) return;
  await query(
    `ALTER TABLE chats ADD COLUMN IF NOT EXISTS auto_translate_enabled BOOLEAN NOT NULL DEFAULT FALSE`,
  );
  await query(`ALTER TABLE chat_members ADD COLUMN IF NOT EXISTS translate_lang TEXT`);
  await query(
    `ALTER TABLE chat_members ADD COLUMN IF NOT EXISTS auto_translate_personal BOOLEAN NOT NULL DEFAULT TRUE`,
  );
  await query(`
    CREATE TABLE IF NOT EXISTS message_translations (
      message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      target_lang TEXT NOT NULL,
      translated_text TEXT NOT NULL,
      source_lang TEXT,
      content_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (message_id, target_lang)
    )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_message_translations_message
    ON message_translations (message_id)
  `);
  tablesEnsured = true;
}

export function normalizeLangCode(lang: string | null | undefined): TranslateLang {
  if (!lang?.trim()) return "en";
  const base = lang.trim().toLowerCase().split(/[-_]/)[0]!;
  return (SUPPORTED_TRANSLATE_LANGS as readonly string[]).includes(base)
    ? (base as TranslateLang)
    : "en";
}

export function contentHash(text: string): string {
  return crypto.createHash("sha256").update(`${text}|v2`, "utf8").digest("hex");
}

const PLACEHOLDER_PREFIX = "{{VIDEH";
const PLACEHOLDER_SUFFIX = "}}";

/** Protect URLs, emails, and phone numbers from being altered by MT. */
export function protectTranslationTokens(input: string): { text: string; tokens: string[] } {
  const tokens: string[] = [];
  const patterns = [
    /https?:\/\/[^\s<>"']+/gi,
    /\bwww\.[^\s<>"']+/gi,
    /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,
    /\+\d[\d\s-]{8,}\d/g,
    /\b\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)\b/g,
    /\b\d{1,2}:\d{2}\b/g,
  ];
  let text = input;
  for (const re of patterns) {
    text = text.replace(re, (match) => {
      const idx = tokens.length;
      tokens.push(match);
      return `${PLACEHOLDER_PREFIX}${idx}${PLACEHOLDER_SUFFIX}`;
    });
  }
  return { text, tokens };
}

export function restoreTranslationTokens(text: string, tokens: string[]): string {
  const restored = text.replace(
    /\{\{VIDEH(\d+)\}\}/gi,
    (_m, idx) => tokens[Number(idx)] ?? _m,
  );
  // Fallback if API altered placeholder spacing/casing
  return restored.replace(
    /\{\{\s*VIDEH\s*(\d+)\s*\}\}/gi,
    (_m, idx) => tokens[Number(idx)] ?? _m,
  );
}

function splitTranslationChunks(text: string, maxLen = 400): string[] {
  if (text.length <= maxLen) return [text];
  const sentences = text.split(/(?<=[.!?…])\s+|\n+/).filter(Boolean);
  const chunks: string[] = [];
  let buf = "";
  for (const sentence of sentences) {
    const piece = buf ? `${buf} ${sentence}` : sentence;
    if (piece.length > maxLen && buf) {
      chunks.push(buf.trim());
      buf = sentence;
    } else if (piece.length > maxLen) {
      // Very long single sentence — hard split
      for (let i = 0; i < sentence.length; i += maxLen) {
        chunks.push(sentence.slice(i, i + maxLen));
      }
      buf = "";
    } else {
      buf = piece;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks.length ? chunks : [text];
}

/** Rough check: Indic target but lots of Latin words left → incomplete translation. */
function looksIncompleteTranslation(translated: string, targetLang: TranslateLang): boolean {
  if (targetLang === "en") return false;
  const words = translated.split(/\s+/).filter((w) => /[A-Za-z]{3,}/.test(w));
  const latinWords = words.filter((w) => !/^\{\{VIDEH\d+\}\}$/i.test(w) && !/^https?:/i.test(w));
  if (latinWords.length < 4) return false;
  const totalWords = translated.split(/\s+/).filter(Boolean).length;
  return latinWords.length / Math.max(totalWords, 1) > 0.15;
}

async function callTranslateApi(
  text: string,
  to: TranslateLang,
  from: string,
): Promise<{ text: string; detected: string }> {
  const result = await translate(text, {
    to,
    from: from === "auto" ? "auto" : from,
    autoSplit: true,
  });
  return {
    text: result.text,
    detected: normalizeLangCode(result.raw.src ?? from),
  };
}

async function translateProtectedText(
  protectedText: string,
  to: TranslateLang,
  from: string,
): Promise<{ text: string; detected: string }> {
  const chunks = splitTranslationChunks(protectedText);
  if (chunks.length === 1) {
    return callTranslateApi(chunks[0]!, to, from);
  }
  const parts: string[] = [];
  let detected = from;
  for (const chunk of chunks) {
    const r = await callTranslateApi(chunk, to, from);
    parts.push(r.text);
    detected = r.detected;
  }
  return { text: parts.join(" "), detected };
}

function isMostlyEmojiOrSymbols(text: string): boolean {
  const stripped = text.replace(/[\s\d\p{P}\p{S}]/gu, "");
  if (!stripped) return true;
  const emojiLike = stripped.replace(/[\p{L}\p{N}]/gu, "");
  return emojiLike.length / stripped.length > 0.6;
}

function languagesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const na = normalizeLangCode(a);
  const nb = normalizeLangCode(b);
  if (na === nb) return true;
  // Hinglish often detected as hi when target is hi
  if ((na === "hi" || na === "en") && (nb === "hi" || nb === "en")) {
    return na === nb;
  }
  return false;
}

/** True when text uses an Indic script (not Latin). */
function containsIndicScript(text: string): boolean {
  return /[\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F\u0A80-\u0AFF\u0B00-\u0B7F\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0D7F]/.test(text);
}

/** Romanized Hinglish (Latin letters) should still convert to native script. */
function needsNativeScriptConversion(
  originalText: string,
  detected: string,
  target: TranslateLang,
): boolean {
  if (target === "en") return false;
  if (containsIndicScript(originalText)) return false;
  const indicTargets = new Set<TranslateLang>([
    "hi", "bn", "ta", "te", "mr", "gu", "kn", "ml", "pa", "or", "as",
  ]);
  if (!indicTargets.has(target)) return false;
  if (languagesMatch(detected, target)) return true;
  if (detected === "en" && target === "hi") return true;
  return false;
}

function shouldForceTranslateDespiteDetection(
  originalText: string,
  detected: string,
  target: TranslateLang,
): boolean {
  if (needsNativeScriptConversion(originalText, detected, target)) return true;
  if (target !== "en") return false;
  if (!containsIndicScript(originalText)) return false;
  return languagesMatch(detected, "en");
}

export type TranslationResult = {
  translated: string;
  sourceLang: string;
  skipped: boolean;
  reason?: string;
};

export async function translateText(
  rawText: string,
  targetLang: string,
  options?: { from?: string; messageId?: number },
): Promise<TranslationResult> {
  const text = rawText.trim();
  const to = normalizeLangCode(targetLang);
  if (!text) {
    return { translated: text, sourceLang: to, skipped: true, reason: "empty" };
  }
  if (text.length > 8000) {
    return { translated: text, sourceLang: "unknown", skipped: true, reason: "too_long" };
  }
  if (isMostlyEmojiOrSymbols(text)) {
    return { translated: text, sourceLang: "unknown", skipped: true, reason: "symbols" };
  }

  const hash = contentHash(text);
  const messageId = options?.messageId;

  if (messageId) {
    const cached = await query(
      `SELECT translated_text, source_lang, content_hash
       FROM message_translations
       WHERE message_id = $1 AND target_lang = $2`,
      [messageId, to],
    );
    const row = cached.rows[0] as {
      translated_text: string;
      source_lang: string | null;
      content_hash: string;
    } | undefined;
    if (row && row.content_hash === hash) {
      const sourceLang = row.source_lang ?? "unknown";
      const staleSameLangCache =
        row.translated_text === text
        && needsNativeScriptConversion(text, sourceLang, to);
      if (!staleSameLangCache) {
        const skipped =
          languagesMatch(sourceLang, to)
          && !shouldForceTranslateDespiteDetection(text, sourceLang, to)
          && !needsNativeScriptConversion(text, sourceLang, to);
        return {
          translated: row.translated_text,
          sourceLang,
          skipped,
        };
      }
    }
  }

  const { text: protectedText, tokens } = protectTranslationTokens(text);
  const from = options?.from && options.from !== "auto" ? normalizeLangCode(options.from) : "auto";
  const apiFrom =
    from === "auto" && needsNativeScriptConversion(text, "en", to) ? "en" : from;

  try {
    let { text: translatedRaw, detected } = await translateProtectedText(protectedText, to, apiFrom);
    if (needsNativeScriptConversion(text, detected, to) && apiFrom !== "en") {
      const retry = await translateProtectedText(protectedText, to, "en");
      translatedRaw = retry.text;
      detected = retry.detected;
    }
    if (
      languagesMatch(detected, to)
      && !shouldForceTranslateDespiteDetection(text, detected, to)
      && !needsNativeScriptConversion(text, detected, to)
    ) {
      return { translated: text, sourceLang: detected, skipped: true, reason: "same_language" };
    }
    let restored = restoreTranslationTokens(translatedRaw, tokens).trim();

    // Retry sentence-by-sentence if middle paragraphs stayed in English
    if (looksIncompleteTranslation(restored, to)) {
      const sentences = splitTranslationChunks(protectedText, 220);
      const retryParts: string[] = [];
      let retryDetected = detected;
      for (const sentence of sentences) {
        const r = await callTranslateApi(sentence, to, from);
        retryParts.push(r.text);
        retryDetected = r.detected;
      }
      translatedRaw = retryParts.join(" ");
      detected = retryDetected;
      restored = restoreTranslationTokens(translatedRaw, tokens).trim();
    }

    const finalText = restored || text;

    if (messageId && finalText !== text) {
      await query(
        `INSERT INTO message_translations (message_id, target_lang, translated_text, source_lang, content_hash)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (message_id, target_lang) DO UPDATE SET
           translated_text = EXCLUDED.translated_text,
           source_lang = EXCLUDED.source_lang,
           content_hash = EXCLUDED.content_hash,
           created_at = NOW()`,
        [messageId, to, finalText, detected, hash],
      );
    }

    return { translated: finalText, sourceLang: detected, skipped: false };
  } catch {
    return { translated: text, sourceLang: "unknown", skipped: true, reason: "api_error" };
  }
}

export async function invalidateMessageTranslations(messageId: number): Promise<void> {
  await ensureTranslationTables();
  await query(`DELETE FROM message_translations WHERE message_id = $1`, [messageId]);
}

export type ViewerTranslationPrefs = {
  groupEnabled: boolean;
  personalEnabled: boolean;
  targetLang: TranslateLang;
  /** Member picked a language in group settings (not app default). */
  memberLangExplicit: boolean;
};

export async function getViewerTranslationPrefs(
  chatId: string | number,
  viewerId: number,
): Promise<ViewerTranslationPrefs | null> {
  await ensureTranslationTables();
  const r = await query(
    `SELECT c.is_group,
            COALESCE(c.auto_translate_enabled, FALSE) AS group_enabled,
            COALESCE(cm.auto_translate_personal, TRUE) AS personal_enabled,
            cm.translate_lang AS member_lang,
            u.preferred_lang AS user_lang
     FROM chats c
     JOIN chat_members cm ON cm.chat_id = c.id AND cm.user_id = $2
     JOIN users u ON u.id = $2
     WHERE c.id = $1`,
    [chatId, viewerId],
  );
  if (!r.rows[0]) return null;
  const row = r.rows[0];
  const memberLang = row.member_lang != null ? String(row.member_lang).trim() : "";
  const memberLangExplicit = memberLang.length > 0;
  if (!row.is_group) {
    return {
      groupEnabled: false,
      personalEnabled: true,
      targetLang: normalizeLangCode(memberLang || row.user_lang),
      memberLangExplicit,
    };
  }
  return {
    groupEnabled: Boolean(row.group_enabled),
    personalEnabled: Boolean(row.personal_enabled),
    targetLang: normalizeLangCode(memberLang || row.user_lang),
    memberLangExplicit,
  };
}

type MessageRow = Record<string, unknown> & {
  id: number;
  content?: string;
  type?: string;
  sender_id?: number;
  is_deleted?: boolean;
};

/** Attach translated_content + translation_source_lang for group auto-translate. */
export async function attachTranslationsForViewer(
  chatId: string | number,
  viewerId: number,
  rows: MessageRow[],
): Promise<MessageRow[]> {
  const chatIdNum = Number(Array.isArray(chatId) ? chatId[0] : chatId);
  const prefs = await getViewerTranslationPrefs(chatIdNum, viewerId);
  if (!prefs?.personalEnabled) return rows;
  if (!prefs.groupEnabled && !prefs.memberLangExplicit) return rows;

  const targetLang = prefs.targetLang;
  const out: MessageRow[] = [];

  const textRows = rows.filter(
    (m) => !m.is_deleted
      && String(m.type ?? "text") === "text"
      && Number(m.sender_id) !== viewerId
      && String(m.content ?? "").trim(),
  );
  // Translate only the newest slice so message GET stays fast for large history.
  const recentTextRows = textRows.slice(-24);

  const concurrency = 4;
  const queue = [...recentTextRows];
  const translationMap = new Map<number, { text: string; sourceLang: string; skipped: boolean }>();

  async function worker() {
    while (queue.length > 0) {
      const m = queue.shift();
      if (!m) break;
      const content = String(m.content ?? "").trim();
      const result = await translateText(content, targetLang, {
        messageId: Number(m.id),
      });
      if (!result.skipped && result.translated !== content) {
        translationMap.set(Number(m.id), {
          text: result.translated,
          sourceLang: result.sourceLang,
          skipped: false,
        });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, recentTextRows.length || 1) }, () => worker()));

  for (const row of rows) {
    const hit = translationMap.get(Number(row.id));
    if (hit) {
      out.push({
        ...row,
        translated_content: hit.text,
        translation_source_lang: hit.sourceLang,
        translation_target_lang: targetLang,
      });
    } else {
      out.push(row);
    }
  }
  return out;
}

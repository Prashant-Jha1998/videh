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
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

/** Protect URLs, emails, mentions, and phone numbers from being altered by MT. */
export function protectTranslationTokens(input: string): { text: string; tokens: string[] } {
  const tokens: string[] = [];
  const patterns = [
    /https?:\/\/[^\s<>"']+/gi,
    /\bwww\.[^\s<>"']+/gi,
    /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,
    /@[\w][\w.]*/g,
    /\+\d[\d\s-]{8,}\d/g,
    /\b\d{10,}\b/g,
  ];
  let text = input;
  for (const re of patterns) {
    text = text.replace(re, (match) => {
      const idx = tokens.length;
      tokens.push(match);
      return `\u27E6${idx}\u27E7`;
    });
  }
  return { text, tokens };
}

export function restoreTranslationTokens(text: string, tokens: string[]): string {
  return text.replace(/\u27E6(\d+)\u27E7/g, (_m, idx) => tokens[Number(idx)] ?? _m);
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
      return {
        translated: row.translated_text,
        sourceLang: row.source_lang ?? "unknown",
        skipped: languagesMatch(row.source_lang, to),
      };
    }
  }

  const { text: protectedText, tokens } = protectTranslationTokens(text);
  const from = options?.from && options.from !== "auto" ? normalizeLangCode(options.from) : "auto";

  try {
    const result = await translate(protectedText, { to, from: from === "auto" ? "auto" : from });
    const detected = normalizeLangCode(result.raw.src ?? from);
    if (languagesMatch(detected, to)) {
      return { translated: text, sourceLang: detected, skipped: true, reason: "same_language" };
    }
    const restored = restoreTranslationTokens(result.text, tokens).trim();
    const finalText = restored || text;

    if (messageId) {
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
  if (!row.is_group) {
    return {
      groupEnabled: false,
      personalEnabled: true,
      targetLang: normalizeLangCode(row.member_lang ?? row.user_lang),
    };
  }
  return {
    groupEnabled: Boolean(row.group_enabled),
    personalEnabled: Boolean(row.personal_enabled),
    targetLang: normalizeLangCode(row.member_lang ?? row.user_lang),
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
  if (!prefs?.groupEnabled || !prefs.personalEnabled) return rows;

  const targetLang = prefs.targetLang;
  const out: MessageRow[] = [];

  const textRows = rows.filter(
    (m) => !m.is_deleted
      && String(m.type ?? "text") === "text"
      && Number(m.sender_id) !== viewerId
      && String(m.content ?? "").trim(),
  );

  const concurrency = 4;
  const queue = [...textRows];
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

  await Promise.all(Array.from({ length: Math.min(concurrency, textRows.length || 1) }, () => worker()));

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

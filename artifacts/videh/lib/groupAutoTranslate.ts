import type { Chat, Message } from "@/context/AppContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl } from "@/lib/api";
import { patchGroupInfoCache, getGroupInfoCache } from "@/lib/groupInfoCache";
import { readLocalGroupTranslateLang, writeLocalGroupTranslateLang } from "@/lib/groupTranslationPrefs";
import { INDIAN_LANGUAGE_OPTIONS } from "@/lib/indianLanguages";

const APP_LANGUAGE_KEY = "appLanguage";
const SUPPORTED_LANGS = new Set(INDIAN_LANGUAGE_OPTIONS.map((l) => l.code));

function normalizeTranslateLang(code: string | null | undefined): string {
  const base = (code?.trim().toLowerCase().split(/[-_]/)[0]) || "en";
  return SUPPORTED_LANGS.has(base as (typeof INDIAN_LANGUAGE_OPTIONS)[number]["code"]) ? base : "en";
}

let appLangCache: { at: number; lang: string } | null = null;

async function readAppDefaultLang(): Promise<string> {
  if (appLangCache && Date.now() - appLangCache.at < 30_000) return appLangCache.lang;
  try {
    const raw = await AsyncStorage.getItem(APP_LANGUAGE_KEY);
    const lang = normalizeTranslateLang(raw);
    appLangCache = { at: Date.now(), lang };
    return lang;
  } catch {
    return "en";
  }
}

export type GroupTranslationPrefs = {
  enabled: boolean;
  targetLang: string;
};

type ServerTranslationSettings = {
  groupAutoTranslateEnabled: boolean;
  memberAutoTranslateEnabled: boolean;
  memberTranslateLang: string | null;
  effectiveLang: string;
};

const settingsCache = new Map<string, { at: number; data: ServerTranslationSettings }>();
const SETTINGS_TTL_MS = 60_000;

/** True when text uses Devanagari, other Indic scripts, or Arabic (Urdu). */
function containsIndicScript(text: string): boolean {
  return /[\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F\u0A80-\u0AFF\u0B00-\u0B7F\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0D7F\u0600-\u06FF]/.test(text);
}

function isUsefulTranslation(original: string, translated: string, targetLang: string): boolean {
  const src = original.trim();
  const out = translated.trim();
  if (!out) return false;
  if (out !== src) return true;
  const indicTargets = new Set(["hi", "bn", "ta", "te", "mr", "gu", "kn", "ml", "pa", "or", "as", "ur"]);
  if (!indicTargets.has(targetLang)) return false;
  return containsIndicScript(out) && !containsIndicScript(src);
}

export function invalidateGroupTranslationSettingsCache(chatId?: string): void {
  if (chatId) {
    settingsCache.delete(String(chatId));
    return;
  }
  settingsCache.clear();
}

export async function fetchGroupTranslationSettings(
  chatId: string,
  userId: number,
  sessionToken: string | null | undefined,
): Promise<ServerTranslationSettings | null> {
  const key = String(chatId);
  const cached = settingsCache.get(key);
  if (cached && Date.now() - cached.at < SETTINGS_TTL_MS) {
    return cached.data;
  }

  try {
    const headers: Record<string, string> = {};
    if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;
    const res = await fetch(
      `${getApiUrl()}/api/chats/${encodeURIComponent(chatId)}/translation-settings?userId=${userId}`,
      { headers },
    );
    const data = await res.json() as {
      success?: boolean;
      groupAutoTranslateEnabled?: boolean;
      memberAutoTranslateEnabled?: boolean;
      memberTranslateLang?: string | null;
      effectiveLang?: string;
    };
    if (!data.success) return null;

    const settings: ServerTranslationSettings = {
      groupAutoTranslateEnabled: Boolean(data.groupAutoTranslateEnabled),
      memberAutoTranslateEnabled: data.memberAutoTranslateEnabled !== false,
      memberTranslateLang: data.memberTranslateLang ?? null,
      effectiveLang: normalizeTranslateLang(data.effectiveLang ?? data.memberTranslateLang ?? "en"),
    };
    settingsCache.set(key, { at: Date.now(), data: settings });
    patchGroupInfoCache(chatId, {
      autoTranslateEnabled: settings.groupAutoTranslateEnabled,
      memberAutoTranslate: settings.memberAutoTranslateEnabled,
      memberTranslateLang: settings.memberTranslateLang,
    });
    if (settings.memberTranslateLang) {
      void writeLocalGroupTranslateLang(chatId, settings.memberTranslateLang);
    }
    return settings;
  } catch {
    return null;
  }
}

/** Resolve this member's reading language for a group (per-member, not sender language). */
export async function resolveGroupTranslationPrefs(
  chat: Chat | undefined,
  chatId: string,
  userId?: number,
  sessionToken?: string | null,
): Promise<GroupTranslationPrefs | null> {
  if (!chat?.isGroup) return null;

  const cached = getGroupInfoCache(chatId);
  let settings: ServerTranslationSettings | null = null;
  if (userId) {
    settings = await fetchGroupTranslationSettings(chatId, userId, sessionToken);
  }

  const explicitLang =
    settings?.memberTranslateLang
    ?? cached?.memberTranslateLang
    ?? (await readLocalGroupTranslateLang(chatId));

  const targetLang = normalizeTranslateLang(
    explicitLang?.trim()
      ? explicitLang
      : (settings?.effectiveLang ?? (await readAppDefaultLang())),
  );

  return { enabled: true, targetLang };
}

function parseMessageIdForTranslate(id: string): number | undefined {
  if (id.startsWith("hint_") && !id.startsWith("hint_t")) {
    const hinted = Number(id.slice(5));
    if (Number.isFinite(hinted) && hinted > 0) return hinted;
  }
  const numeric = Number(id);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  return undefined;
}

export function messagesNeedingGroupTranslation(
  messages: Message[],
  prefs: GroupTranslationPrefs,
): Message[] {
  return messages.filter((m) => {
    if (m.senderId === "me") return false;
    if (m.type && m.type !== "text") return false;
    if (!m.text?.trim()) return false;
    if (m.id.startsWith("tmp_")) return false;
    if (
      m.translatedText?.trim()
      && m.translationTargetLang === prefs.targetLang
      && isUsefulTranslation(m.text, m.translatedText, prefs.targetLang)
    ) {
      return false;
    }
    return true;
  });
}

export async function fetchGroupAutoTranslations(args: {
  userId: number;
  sessionToken: string | null | undefined;
  targetLang: string;
  messages: Message[];
}): Promise<Array<{ messageId: string; translated: string; sourceLang: string }>> {
  const items = args.messages
    .filter((m) => !m.id.startsWith("tmp_"))
    .map((m) => {
      const messageId = parseMessageIdForTranslate(m.id);
      return { rowId: m.id, messageId, text: m.text.trim() };
    })
    .filter((m) => m.text && (m.messageId != null || m.rowId.startsWith("hint_")));

  if (!items.length) return [];

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (args.sessionToken) headers.Authorization = `Bearer ${args.sessionToken}`;

  const res = await fetch(`${getApiUrl()}/api/translate/batch`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      userId: args.userId,
      targetLang: args.targetLang,
      items: items.map((m) => ({
        messageId: m.messageId,
        text: m.text,
      })),
    }),
  });
  const data = await res.json() as {
    success?: boolean;
    results?: Array<{ index: number; translated: string; sourceLang: string; skipped: boolean }>;
  };
  if (!data.success || !data.results?.length) return [];

  const out: Array<{ messageId: string; translated: string; sourceLang: string }> = [];
  for (const row of data.results) {
    const src = items[row.index];
    if (!src) continue;
    if (row.skipped) continue;
    const translated = row.translated?.trim();
    if (!translated || !isUsefulTranslation(src.text, translated, args.targetLang)) continue;
    const keys = new Set<string>([String(src.rowId)]);
    if (src.messageId != null) keys.add(String(src.messageId));
    if (src.messageId != null) keys.add(`hint_${src.messageId}`);
    for (const key of keys) {
      out.push({
        messageId: key,
        translated,
        sourceLang: row.sourceLang ?? "unknown",
      });
    }
  }
  return out;
}

export function lookupGroupTranslationResult(
  byId: Map<string, { translated: string; sourceLang: string }>,
  messageId: string,
): { translated: string; sourceLang: string } | undefined {
  const direct = byId.get(messageId);
  if (direct) return direct;
  if (messageId.startsWith("hint_")) {
    return byId.get(messageId.slice(5));
  }
  const numeric = Number(messageId);
  if (Number.isFinite(numeric) && numeric > 0) {
    return byId.get(`hint_${numeric}`) ?? byId.get(String(numeric));
  }
  return undefined;
}

/** Translate the newest incoming text rows (for SSE hints before full reload). */
export async function translateIncomingGroupMessages(args: {
  chatId: string;
  userId: number;
  sessionToken: string | null | undefined;
  chat: Chat | undefined;
  messages: Message[];
}): Promise<Array<{ messageId: string; translated: string; sourceLang: string; targetLang: string }>> {
  const prefs = await resolveGroupTranslationPrefs(args.chat, args.chatId, args.userId, args.sessionToken);
  if (!prefs) return [];
  const needs = messagesNeedingGroupTranslation(args.messages, prefs);
  if (!needs.length) return [];
  const results = await fetchGroupAutoTranslations({
    userId: args.userId,
    sessionToken: args.sessionToken,
    targetLang: prefs.targetLang,
    messages: needs,
  });
  return results.map((r) => ({ ...r, targetLang: prefs.targetLang }));
}

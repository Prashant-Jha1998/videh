import type { Chat, Message } from "@/context/AppContext";
import { getApiUrl } from "@/lib/api";
import { getGroupInfoCache } from "@/lib/groupInfoCache";
import { readLocalGroupTranslateLang } from "@/lib/groupTranslationPrefs";

export type GroupTranslationPrefs = {
  enabled: boolean;
  targetLang: string;
};

export async function resolveGroupTranslationPrefs(
  chat: Chat | undefined,
  chatId: string,
): Promise<GroupTranslationPrefs | null> {
  if (!chat?.isGroup) return null;
  const cached = getGroupInfoCache(chatId);
  const groupOn = Boolean(chat.autoTranslateEnabled ?? cached?.autoTranslateEnabled);
  const personalOn = cached?.memberAutoTranslate !== false;
  if (!groupOn || !personalOn) return null;

  let targetLang = cached?.memberTranslateLang ?? null;
  if (!targetLang) {
    targetLang = await readLocalGroupTranslateLang(chatId);
  }
  if (!targetLang) return null;
  return { enabled: true, targetLang };
}

export function messagesNeedingGroupTranslation(
  messages: Message[],
  prefs: GroupTranslationPrefs,
): Message[] {
  return messages.filter((m) => {
    if (m.senderId === "me") return false;
    if (m.type && m.type !== "text") return false;
    if (!m.text?.trim()) return false;
    if (m.id.startsWith("tmp_") || m.id.startsWith("hint_")) return false;
    if (m.translatedText?.trim() && m.translatedText !== m.text) return false;
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
    .filter((m) => !m.id.startsWith("tmp_") && !m.id.startsWith("hint_"))
    .map((m) => ({
      messageId: Number(m.id),
      text: m.text.trim(),
    }))
    .filter((m) => Number.isFinite(m.messageId) && m.messageId > 0 && m.text);

  if (!items.length) return [];

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (args.sessionToken) headers.Authorization = `Bearer ${args.sessionToken}`;

  const res = await fetch(`${getApiUrl()}/api/translate/batch`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      userId: args.userId,
      targetLang: args.targetLang,
      items,
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
    const translated = row.translated?.trim();
    if (!translated || translated === src.text) continue;
    out.push({
      messageId: String(src.messageId),
      translated,
      sourceLang: row.sourceLang ?? "unknown",
    });
  }
  return out;
}

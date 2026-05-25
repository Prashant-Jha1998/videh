import { getApiUrl } from "./api";
import type { AssistantLangCode } from "./assistantLanguages";
import type { AssistantPrefs, VoiceFingerprint } from "./assistantPrefs";

function authHeaders(token?: string | null): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export type AssistantCommandResult = {
  speak: string;
  intent?: string;
  langCode?: AssistantLangCode;
  speechLocale?: string;
  actions?: Array<{ type: string; chatId?: string; callType?: string; contactName?: string }>;
};

export async function fetchAssistantPrefs(token?: string | null): Promise<AssistantPrefs | null> {
  const res = await fetch(`${getApiUrl()}/api/assistant/prefs`, { headers: authHeaders(token) });
  const data = await res.json() as { success?: boolean; prefs?: AssistantPrefs };
  return data.success && data.prefs ? data.prefs : null;
}

export async function patchAssistantPrefs(
  token: string | null | undefined,
  patch: Partial<Pick<AssistantPrefs, "enabled" | "listenWhenLocked">>,
): Promise<boolean> {
  const res = await fetch(`${getApiUrl()}/api/assistant/prefs`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify({
      enabled: patch.enabled,
      listenWhenLocked: patch.listenWhenLocked,
    }),
  });
  const data = await res.json() as { success?: boolean };
  return Boolean(data.success);
}

export async function deleteAssistantVoice(token: string | null | undefined): Promise<boolean> {
  const res = await fetch(`${getApiUrl()}/api/assistant/enroll`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  const data = await res.json() as { success?: boolean };
  return Boolean(data.success);
}

export async function enrollAssistantVoice(
  token: string | null | undefined,
  samples: VoiceFingerprint[],
): Promise<{ ok: boolean; message?: string }> {
  const res = await fetch(`${getApiUrl()}/api/assistant/enroll`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ samples }),
  });
  const data = await res.json() as { success?: boolean; message?: string };
  if (!res.ok || !data.success) {
    return { ok: false, message: data.message ?? `Save failed (${res.status})` };
  }
  return { ok: true };
}

export async function verifyAssistantVoice(
  token: string | null | undefined,
  fingerprint: VoiceFingerprint,
): Promise<{ match: boolean; score: number }> {
  const res = await fetch(`${getApiUrl()}/api/assistant/verify-voice`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ fingerprint }),
  });
  const data = await res.json() as { success?: boolean; match?: boolean; score?: number };
  return { match: Boolean(data.match), score: Number(data.score ?? 0) };
}

export async function runAssistantCommand(
  token: string | null | undefined,
  text: string,
  localeHint?: AssistantLangCode,
): Promise<AssistantCommandResult> {
  const res = await fetch(`${getApiUrl()}/api/assistant/command`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ text, locale: localeHint }),
  });
  const data = await res.json() as {
    success?: boolean;
    speak?: string;
    intent?: string;
    langCode?: AssistantLangCode;
    speechLocale?: string;
    actions?: Array<{ type: string; chatId?: string; callType?: string; contactName?: string }>;
  };
  if (!data.success) throw new Error("Assistant command failed");
  return {
    speak: data.speak ?? "Done.",
    intent: data.intent,
    langCode: data.langCode,
    speechLocale: data.speechLocale,
    actions: data.actions,
  };
}

export async function fetchAssistantGreeting(
  token: string | null | undefined,
  userId: number,
  locale: AssistantLangCode = "hi",
): Promise<{ speak: string; langCode?: AssistantLangCode; speechLocale?: string }> {
  const res = await fetch(`${getApiUrl()}/api/assistant/greeting/${userId}?locale=${locale}`, {
    headers: authHeaders(token),
  });
  const data = await res.json() as {
    success?: boolean;
    speak?: string;
    langCode?: AssistantLangCode;
    speechLocale?: string;
  };
  return {
    speak: data.speak ?? "Videh aapki seva mein hazir hai.",
    langCode: data.langCode,
    speechLocale: data.speechLocale,
  };
}

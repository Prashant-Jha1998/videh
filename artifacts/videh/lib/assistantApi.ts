import { getApiUrl } from "./api";
import type { AssistantPrefs, VoiceFingerprint } from "./assistantPrefs";

function authHeaders(token?: string | null): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

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

export async function enrollAssistantVoice(
  token: string | null | undefined,
  samples: VoiceFingerprint[],
): Promise<boolean> {
  const res = await fetch(`${getApiUrl()}/api/assistant/enroll`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ samples }),
  });
  const data = await res.json() as { success?: boolean };
  return Boolean(data.success);
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
  locale: "hi" | "en" = "hi",
): Promise<{
  speak: string;
  intent?: string;
  actions?: Array<{ type: string; chatId?: string }>;
}> {
  const res = await fetch(`${getApiUrl()}/api/assistant/command`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ text, locale }),
  });
  const data = await res.json() as {
    success?: boolean;
    speak?: string;
    intent?: string;
    actions?: Array<{ type: string; chatId?: string }>;
  };
  if (!data.success) throw new Error("Assistant command failed");
  return {
    speak: data.speak ?? "Done.",
    intent: data.intent,
    actions: data.actions,
  };
}

export async function fetchAssistantGreeting(
  token: string | null | undefined,
  userId: number,
  locale: "hi" | "en" = "hi",
): Promise<string> {
  const res = await fetch(`${getApiUrl()}/api/assistant/greeting/${userId}?locale=${locale}`, {
    headers: authHeaders(token),
  });
  const data = await res.json() as { success?: boolean; speak?: string };
  return data.speak ?? "Videh aapki seva mein hazir hai.";
}

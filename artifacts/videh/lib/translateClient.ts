import { getApiUrl } from "@/lib/api";

export async function translateMessageText(
  text: string,
  toLang: string,
  sessionToken?: string | null,
): Promise<{ success: boolean; translated?: string }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;
  const res = await fetch(`${getApiUrl()}/api/translate`, {
    method: "POST",
    headers,
    body: JSON.stringify({ text, to: toLang }),
  });
  return (await res.json()) as { success: boolean; translated?: string };
}

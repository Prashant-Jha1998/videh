import type { AVPlaybackSource } from "expo-av";

/** Pass auth headers so protected /api/chats/media URLs can stream in expo-av. */
export function authPlaybackSource(uri: string, sessionToken?: string | null): AVPlaybackSource {
  if (!uri || uri.startsWith("data:") || uri.startsWith("file:")) return { uri };
  if (!sessionToken || !uri.includes("/api/chats/media/")) return { uri };
  return { uri, headers: { Authorization: `Bearer ${sessionToken}` } };
}

export function authFetchHeaders(sessionToken?: string | null): HeadersInit | undefined {
  return sessionToken ? { Authorization: `Bearer ${sessionToken}` } : undefined;
}

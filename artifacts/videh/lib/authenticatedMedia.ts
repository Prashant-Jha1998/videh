import type { AVPlaybackSource } from "expo-av";
import { resolvePublicAssetUrl } from "./publicAssetUrl";

/** Pass auth headers so protected /api/chats/media URLs can stream in expo-av. */
export function authPlaybackSource(uri: string, sessionToken?: string | null): AVPlaybackSource {
  const absolute = resolvePublicAssetUrl(uri) ?? uri;
  if (!absolute || absolute.startsWith("data:") || absolute.startsWith("file:") || absolute.startsWith("content:")) {
    return { uri: absolute || uri };
  }
  if (!sessionToken || !absolute.includes("/api/chats/media/")) return { uri: absolute };
  return { uri: absolute, headers: { Authorization: `Bearer ${sessionToken}` } };
}

export function authFetchHeaders(sessionToken?: string | null): HeadersInit | undefined {
  return sessionToken ? { Authorization: `Bearer ${sessionToken}` } : undefined;
}

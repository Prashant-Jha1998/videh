import type { AVPlaybackSource } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import { useEffect, useState } from "react";
import { authFetchHeaders, authPlaybackSource } from "./authenticatedMedia";
import { resolvePublicAssetUrl } from "./publicAssetUrl";

function audioExtFromUri(uri: string): string {
  const trimmed = uri.trim();
  const mime = trimmed.match(/^data:([^;]+)/)?.[1] ?? "";
  const path = trimmed.split("?")[0] ?? trimmed;
  if (mime.includes("mpeg")) return "mp3";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("aac")) return "aac";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("3gpp") || mime.includes("3gp")) return "3gp";
  if (mime.includes("amr")) return "amr";
  if (mime.includes("mpeg") || path.endsWith(".mp3")) return "mp3";
  if (mime.includes("wav") || path.endsWith(".wav")) return "wav";
  if (mime.includes("aac") || path.endsWith(".aac")) return "aac";
  if (mime.includes("ogg") || path.endsWith(".ogg")) return "ogg";
  if (mime.includes("3gpp") || mime.includes("3gp") || path.endsWith(".3gp")) return "3gp";
  if (mime.includes("amr") || path.endsWith(".amr")) return "amr";
  if (path.endsWith(".caf")) return "caf";
  if (mime.includes("mp4") || mime.includes("m4a") || path.endsWith(".m4a")) return "m4a";
  return "m4a";
}

/**
 * Resolves voice-note sources for expo-av: local files, data URIs, and auth-protected chat media.
 */
export function usePlayableAudioUri(uri: string | undefined, sessionToken?: string | null): {
  playbackSource: AVPlaybackSource | null;
  failed: boolean;
  loading: boolean;
} {
  const [playbackSource, setPlaybackSource] = useState<AVPlaybackSource | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!uri) {
      setPlaybackSource(null);
      setFailed(false);
      return;
    }

    const absolute = (resolvePublicAssetUrl(uri) ?? uri).trim();

    if (absolute.startsWith("file:") || absolute.startsWith("content:")) {
      setPlaybackSource({ uri: absolute });
      setFailed(false);
      return;
    }

    if (!absolute.startsWith("data:")) {
      setPlaybackSource(authPlaybackSource(absolute, sessionToken));
      setFailed(false);
      return () => {
        cancelled = true;
      };
    }

    const writeDataUri = async () => {
      try {
        const cacheDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? "";
        if (!cacheDir) throw new Error("No writable cache directory");
        const ext = audioExtFromUri(absolute);
        const target = `${cacheDir}voice_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
        const base64 = absolute.replace(/^data:[^;]+;base64,/, "");
        await FileSystem.writeAsStringAsync(target, base64, { encoding: FileSystem.EncodingType.Base64 });
        if (!cancelled) {
          setPlaybackSource({ uri: target });
          setFailed(false);
        }
      } catch {
        if (!cancelled) {
          setFailed(true);
          setPlaybackSource(null);
        }
      }
    };
    void writeDataUri();

    return () => {
      cancelled = true;
    };
  }, [uri, sessionToken]);

  const loading = Boolean(uri) && !failed && !playbackSource;
  return { playbackSource: failed ? null : playbackSource, failed, loading };
}

/** Download protected chat audio when expo-av cannot stream it (older Android builds). */
export async function downloadPlayableAudioSource(
  source: AVPlaybackSource,
  sessionToken?: string | null,
): Promise<AVPlaybackSource> {
  const uri = typeof source === "number" ? null : "uri" in source ? source.uri : null;
  if (!uri) return source;
  if (!uri.includes("/api/chats/media/") || !sessionToken) return source;

  const cacheDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? "";
  if (!cacheDir) throw new Error("No cache");
  const ext = audioExtFromUri(uri);
  const target = `${cacheDir}auth_audio_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const res = await FileSystem.downloadAsync(uri, target, {
    headers: authFetchHeaders(sessionToken) as Record<string, string>,
  });
  return { uri: res.uri };
}

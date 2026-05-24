import * as FileSystem from "expo-file-system/legacy";
import { useEffect, useState } from "react";
import { authFetchHeaders } from "./authenticatedMedia";
import { resolvePublicAssetUrl } from "./publicAssetUrl";

function audioExtFromUri(uri: string): string {
  if (uri.includes("audio/mpeg") || uri.endsWith(".mp3")) return "mp3";
  if (uri.includes("audio/wav") || uri.endsWith(".wav")) return "wav";
  if (uri.includes("audio/aac") || uri.endsWith(".aac")) return "aac";
  if (uri.includes("audio/ogg") || uri.endsWith(".ogg")) return "ogg";
  return "m4a";
}

/**
 * Resolves voice-note URIs for expo-av: data: URLs, auth-protected chat media, file:// paths.
 */
export function usePlayableAudioUri(uri: string | undefined, sessionToken?: string | null): {
  playableUri: string | null;
  failed: boolean;
  loading: boolean;
} {
  const [playableUri, setPlayableUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let tempFile: string | null = null;

    if (!uri) {
      setPlayableUri(null);
      setFailed(false);
      return;
    }

    const absolute = resolvePublicAssetUrl(uri) ?? uri;

    if (absolute.startsWith("file:") || absolute.startsWith("content:")) {
      setPlayableUri(absolute);
      setFailed(false);
      return;
    }

    if (!absolute.startsWith("data:audio")) {
      const needsAuth = absolute.includes("/api/chats/media/") && sessionToken;
      if (!needsAuth) {
        setPlayableUri(absolute);
        setFailed(false);
        return;
      }

      const downloadAuth = async () => {
        try {
          const cacheDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? "";
          if (!cacheDir) throw new Error("No cache");
          const ext = audioExtFromUri(absolute);
          const target = `${cacheDir}auth_audio_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
          tempFile = target;
          const res = await FileSystem.downloadAsync(
            absolute,
            target,
            { headers: authFetchHeaders(sessionToken) as Record<string, string> },
          );
          if (!cancelled) {
            setPlayableUri(res.uri);
            setFailed(false);
          }
        } catch {
          if (!cancelled) {
            setFailed(true);
            setPlayableUri(null);
          }
        }
      };
      void downloadAuth();
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
        tempFile = target;
        const base64 = absolute.replace(/^data:[^;]+;base64,/, "");
        await FileSystem.writeAsStringAsync(target, base64, { encoding: FileSystem.EncodingType.Base64 });
        if (!cancelled) {
          setPlayableUri(target);
          setFailed(false);
        }
      } catch {
        if (!cancelled) {
          setFailed(true);
          setPlayableUri(null);
        }
      }
    };
    void writeDataUri();

    return () => {
      cancelled = true;
    };
  }, [uri, sessionToken]);

  const loading = Boolean(uri) && !failed && !playableUri;
  return { playableUri: failed ? null : playableUri, failed, loading };
}

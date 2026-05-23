import * as FileSystem from "expo-file-system/legacy";
import { useEffect, useState } from "react";
import { authFetchHeaders } from "./authenticatedMedia";

/**
 * Resolves video URIs for expo-av, including auth-protected chat media and data: URLs.
 */
export function usePlayableVideoUri(uri: string | undefined, sessionToken?: string | null): {
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
    if (!uri.startsWith("data:video")) {
      const needsAuth = uri.includes("/api/chats/media/") && sessionToken;
      if (!needsAuth) {
        setPlayableUri(uri);
        setFailed(false);
        return;
      }
      const prepareAuth = async () => {
        try {
          const cacheDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? "";
          if (!cacheDir) throw new Error("No cache");
          const target = `${cacheDir}auth_vid_${Date.now()}.mp4`;
          tempFile = target;
          const res = await FileSystem.downloadAsync(uri, target, { headers: authFetchHeaders(sessionToken) as Record<string, string> });
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
      void prepareAuth();
      return () => {
        cancelled = true;
        if (tempFile) FileSystem.deleteAsync(tempFile, { idempotent: true }).catch(() => {});
      };
    }
    const prepare = async () => {
      try {
        const cacheDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? "";
        if (!cacheDir) throw new Error("No writable cache directory");
        const ext = uri.includes("video/quicktime") ? "mov" : "mp4";
        const target = `${cacheDir}video_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
        tempFile = target;
        const base64 = uri.replace(/^data:[^;]+;base64,/, "");
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
    void prepare();
    return () => {
      cancelled = true;
      if (tempFile) {
        FileSystem.deleteAsync(tempFile, { idempotent: true }).catch(() => {});
      }
    };
  }, [uri, sessionToken]);

  const loading = Boolean(uri) && !failed && !playableUri;
  return { playableUri: failed ? null : playableUri, failed, loading };
}

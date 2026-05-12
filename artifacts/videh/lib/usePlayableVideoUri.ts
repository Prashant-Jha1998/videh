import * as FileSystem from "expo-file-system/legacy";
import { useEffect, useState } from "react";

/**
 * Resolves `data:video/...;base64,...` into a temp `file://` path; passes through http(s) and file URIs.
 */
export function usePlayableVideoUri(uri: string | undefined): {
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
      setPlayableUri(uri);
      setFailed(false);
      return;
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
  }, [uri]);

  const loading = Boolean(uri) && !failed && !playableUri;
  return { playableUri: failed ? null : playableUri, failed, loading };
}

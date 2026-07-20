import * as FileSystem from "expo-file-system/legacy";
import { useEffect, useState } from "react";
import { resolvePublicAssetUrl, withStatusMediaAuth } from "./publicAssetUrl";
import { getCachedAuthMediaFile, peekCachedAuthMediaFile, peekCachedAuthMediaFileSync } from "./useCachedAuthMediaUri";

function videoExtFromUri(uri: string): string {
  const trimmed = uri.trim();
  const mime = trimmed.match(/^data:([^;]+)/)?.[1] ?? "";
  const path = trimmed.split("?")[0] ?? trimmed;
  if (mime.includes("quicktime") || path.endsWith(".mov")) return "mov";
  if (mime.includes("3gpp") || mime.includes("3gp") || path.endsWith(".3gp")) return "3gp";
  if (path.endsWith(".m4v")) return "m4v";
  return "mp4";
}

function stableKey(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

const videoCacheDir = (): string => {
  const base = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? "";
  return base ? `${base}videh_video/` : "";
};

async function ensureCacheDir(): Promise<string> {
  const dir = videoCacheDir();
  if (!dir) throw new Error("No writable cache directory");
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
  } catch {
    /* directory may already exist */
  }
  return dir;
}

/**
 * Resolves video URIs for story/chat playback.
 * Stories: cache hit → local; otherwise stream immediately (token auth), warm cache in background.
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

    setFailed(false);

    const absolute = (resolvePublicAssetUrl(uri) ?? uri).trim();

    if (absolute.startsWith("file:") || absolute.startsWith("content:")) {
      setPlayableUri(absolute);
      return;
    }

    if (absolute.startsWith("data:")) {
      setPlayableUri(null);
      const prepare = async () => {
        try {
          const dir = await ensureCacheDir();
          const ext = videoExtFromUri(absolute);
          const target = `${dir}data_${stableKey(absolute).slice(0, 12)}.${ext}`;
          tempFile = target;
          const existing = await FileSystem.getInfoAsync(target);
          if (!existing.exists) {
            const base64 = absolute.replace(/^data:[^;]+;base64,/, "");
            await FileSystem.writeAsStringAsync(target, base64, { encoding: FileSystem.EncodingType.Base64 });
          }
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
        if (tempFile) FileSystem.deleteAsync(tempFile, { idempotent: true }).catch(() => {});
      };
    }

    if (absolute.startsWith("http://") || absolute.startsWith("https://")) {
      const isStatus = absolute.includes("/api/statuses/media/");
      if (isStatus) {
        // Instant play for other viewers: local cache if known, else stream with token
        // (no wait for full download). Warm cache in background; never swap mid-play.
        const cachedSync = peekCachedAuthMediaFileSync(absolute, "mp4");
        const streamUri = withStatusMediaAuth(absolute, sessionToken) ?? absolute;
        setPlayableUri(cachedSync ?? streamUri);
        if (!cachedSync) {
          void (async () => {
            const onDisk = await peekCachedAuthMediaFile(absolute, "mp4");
            if (onDisk) return; // memory seeded for next open
            void getCachedAuthMediaFile(absolute, sessionToken, "mp4").catch(() => {});
          })();
        }
        return () => {
          cancelled = true;
        };
      }

      setPlayableUri(null);
      const prepareRemote = async () => {
        try {
          const localUri = await getCachedAuthMediaFile(absolute, sessionToken, "mp4");
          if (!cancelled) {
            setPlayableUri(localUri);
            setFailed(false);
          }
        } catch {
          if (!cancelled) {
            setPlayableUri(absolute);
            setFailed(false);
          }
        }
      };
      void prepareRemote();
      return () => {
        cancelled = true;
      };
    }

    setPlayableUri(absolute);
    return () => {
      cancelled = true;
    };
  }, [uri, sessionToken]);

  const loading = Boolean(uri) && !failed && !playableUri;
  return { playableUri: failed ? null : playableUri, failed, loading };
}

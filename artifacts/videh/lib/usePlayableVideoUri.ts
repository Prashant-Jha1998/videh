import * as FileSystem from "expo-file-system/legacy";
import { useEffect, useState } from "react";
import { authFetchHeaders } from "./authenticatedMedia";
import { resolvePublicAssetUrl } from "./publicAssetUrl";

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

const downloadLocks = new Map<string, Promise<string>>();

async function getCachedVideoFile(absoluteUrl: string, sessionToken?: string | null): Promise<string> {
  const inflight = downloadLocks.get(absoluteUrl);
  if (inflight) return inflight;

  const task = (async () => {
    const dir = await ensureCacheDir();
    const ext = videoExtFromUri(absoluteUrl);
    const target = `${dir}v_${stableKey(absoluteUrl)}.${ext}`;

    const existing = await FileSystem.getInfoAsync(target);
    if (existing.exists && (existing.size ?? 0) > 0) return target;

    const needsAuth =
      (absoluteUrl.includes("/api/chats/media/") || absoluteUrl.includes("/api/statuses/media/"))
      && Boolean(sessionToken);
    const res = await FileSystem.downloadAsync(absoluteUrl, target, {
      headers: needsAuth ? (authFetchHeaders(sessionToken) as Record<string, string>) : undefined,
    });
    if (res.status >= 400) {
      await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => {});
      throw new Error(`Download failed (${res.status})`);
    }
    return res.uri;
  })();

  downloadLocks.set(absoluteUrl, task);
  try {
    return await task;
  } finally {
    downloadLocks.delete(absoluteUrl);
  }
}

/**
 * Resolves video URIs for expo-av: local files, data URIs, and remote story/chat media.
 * Remote videos are cached locally first so playback is reliable on Android.
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
    setPlayableUri(null);

    const absolute = (resolvePublicAssetUrl(uri) ?? uri).trim();

    if (absolute.startsWith("file:") || absolute.startsWith("content:")) {
      setPlayableUri(absolute);
      return;
    }

    if (absolute.startsWith("data:")) {
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
      // Status media requires auth; download with Authorization (query-token streaming is unreliable on Android).
      const prepareRemote = async () => {
        try {
          const localUri = await getCachedVideoFile(absolute, sessionToken);
          if (!cancelled) {
            setPlayableUri(localUri);
            setFailed(false);
          }
        } catch {
          if (!cancelled) {
            // Last resort: try streaming the resolved absolute URL directly.
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

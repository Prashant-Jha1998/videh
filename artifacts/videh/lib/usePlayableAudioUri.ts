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

/** Stable djb2 hash so the same remote URL always maps to the same cache file. */
function stableKey(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

const voiceCacheDir = (): string => {
  const base = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? "";
  return base ? `${base}videh_voice/` : "";
};

async function ensureCacheDir(): Promise<string> {
  const dir = voiceCacheDir();
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

/**
 * Downloads a remote voice note to a stable local cache file once, then reuses it.
 * Playing from a local file is far more reliable on Android than streaming a
 * protected URL with auth headers (which is what caused "Playback failed").
 */
async function getCachedAudioFile(absoluteUrl: string, sessionToken?: string | null): Promise<string> {
  const inflight = downloadLocks.get(absoluteUrl);
  if (inflight) return inflight;

  const task = (async () => {
    const dir = await ensureCacheDir();
    const ext = audioExtFromUri(absoluteUrl);
    const target = `${dir}v_${stableKey(absoluteUrl)}.${ext}`;

    const existing = await FileSystem.getInfoAsync(target);
    if (existing.exists && (existing.size ?? 0) > 0) return target;

    const needsAuth = absoluteUrl.includes("/api/chats/media/") && Boolean(sessionToken);
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
 * Resolves voice-note sources for expo-av: local files, data URIs, and remote
 * chat media. Remote media is downloaded to a local cache file first so playback
 * is reliable (Videh), instead of streaming with auth headers.
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

    setFailed(false);
    setPlaybackSource(null);

    const absolute = (resolvePublicAssetUrl(uri) ?? uri).trim();

    if (absolute.startsWith("file:") || absolute.startsWith("content:")) {
      setPlaybackSource({ uri: absolute });
      return;
    }

    if (absolute.startsWith("data:")) {
      const writeDataUri = async () => {
        try {
          const dir = await ensureCacheDir();
          const ext = audioExtFromUri(absolute);
          const target = `${dir}data_${stableKey(absolute).slice(0, 12)}.${ext}`;
          const existing = await FileSystem.getInfoAsync(target);
          if (!existing.exists) {
            const base64 = absolute.replace(/^data:[^;]+;base64,/, "");
            await FileSystem.writeAsStringAsync(target, base64, { encoding: FileSystem.EncodingType.Base64 });
          }
          if (!cancelled) setPlaybackSource({ uri: target });
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
    }

    if (absolute.startsWith("http://") || absolute.startsWith("https://")) {
      const prepareRemote = async () => {
        try {
          const localUri = await getCachedAudioFile(absolute, sessionToken);
          if (!cancelled) setPlaybackSource({ uri: localUri });
        } catch {
          if (cancelled) return;
          // Fall back to direct streaming so playback can still be attempted.
          setPlaybackSource(authPlaybackSource(absolute, sessionToken));
        }
      };
      void prepareRemote();
      return () => {
        cancelled = true;
      };
    }

    setPlaybackSource({ uri: absolute });
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
  if (uri.startsWith("file:") || uri.startsWith("content:")) return source;
  if (!uri.startsWith("http://") && !uri.startsWith("https://")) return source;

  try {
    const localUri = await getCachedAudioFile(uri, sessionToken);
    return { uri: localUri };
  } catch {
    return source;
  }
}

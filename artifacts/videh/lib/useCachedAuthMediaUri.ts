import * as FileSystem from "expo-file-system/legacy";
import { useEffect, useState } from "react";
import { authFetchHeaders } from "./authenticatedMedia";
import { resolvePublicAssetUrl } from "./publicAssetUrl";

/** Remove ?token= so Authorization header is the sole auth (avoids stale/double-auth issues). */
export function stripMediaAuthQuery(url: string): string {
  const raw = url.trim();
  if (!raw) return raw;
  try {
    const u = new URL(raw);
    if (!u.searchParams.has("token")) return raw;
    u.searchParams.delete("token");
    const qs = u.searchParams.toString();
    return qs ? `${u.origin}${u.pathname}?${qs}` : `${u.origin}${u.pathname}`;
  } catch {
    return raw
      .replace(/([?&])token=[^&]*/g, "$1")
      .replace(/[?&]$/, "")
      .replace(/\?&/, "?")
      .replace(/&&/g, "&");
  }
}

function mediaExtFromUri(uri: string, fallback: "jpg" | "mp4"): string {
  const trimmed = uri.trim();
  const mime = trimmed.match(/^data:([^;]+)/)?.[1] ?? "";
  const path = (trimmed.split("?")[0] ?? trimmed).toLowerCase();
  if (mime.includes("png") || path.endsWith(".png")) return "png";
  if (mime.includes("webp") || path.endsWith(".webp")) return "webp";
  if (mime.includes("jpeg") || mime.includes("jpg") || path.endsWith(".jpg") || path.endsWith(".jpeg")) return "jpg";
  if (mime.includes("quicktime") || path.endsWith(".mov")) return "mov";
  if (mime.includes("3gpp") || path.endsWith(".3gp")) return "3gp";
  if (path.endsWith(".m4v")) return "m4v";
  if (mime.includes("mp4") || path.endsWith(".mp4")) return "mp4";
  return fallback;
}

function stableKey(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

const cacheDir = (): string => {
  const base = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? "";
  return base ? `${base}videh_status_media/` : "";
};

async function ensureCacheDir(): Promise<string> {
  const dir = cacheDir();
  if (!dir) throw new Error("No writable cache directory");
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
  } catch {
    /* may already exist */
  }
  return dir;
}

function needsAuthDownload(url: string): boolean {
  return url.includes("/api/statuses/media/") || url.includes("/api/chats/media/");
}

const downloadLocks = new Map<string, Promise<string>>();
/** In-memory map so reopen can use local files synchronously (no mid-play URI swap). */
const memoryCachedPaths = new Map<string, string>();

function cacheTargetForUrl(absoluteUrl: string, fallbackExt: "jpg" | "mp4"): { cleanUrl: string; cacheKey: string; target: string } {
  const cleanUrl = stripMediaAuthQuery(absoluteUrl);
  const cacheKey = cleanUrl.split("?")[0] ?? cleanUrl;
  const ext = mediaExtFromUri(cleanUrl, fallbackExt);
  // Dir may not exist yet — caller should ensureCacheDir before writing.
  const dir = cacheDir();
  return { cleanUrl, cacheKey, target: dir ? `${dir}m_${stableKey(cacheKey)}.${ext}` : "" };
}

/** Sync memory peek (same-session). */
export function peekCachedAuthMediaFileSync(
  absoluteUrl: string,
  fallbackExt: "jpg" | "mp4" = "jpg",
): string | null {
  const { cacheKey } = cacheTargetForUrl(absoluteUrl, fallbackExt);
  return memoryCachedPaths.get(cacheKey) ?? null;
}

/** Fast path: return existing local cache without network. */
export async function peekCachedAuthMediaFile(
  absoluteUrl: string,
  fallbackExt: "jpg" | "mp4" = "jpg",
): Promise<string | null> {
  const { cacheKey, target } = cacheTargetForUrl(absoluteUrl, fallbackExt);
  const mem = memoryCachedPaths.get(cacheKey);
  if (mem) return mem;
  if (!target) return null;
  try {
    const info = await FileSystem.getInfoAsync(target);
    if (info.exists && (info.size ?? 0) > 256) {
      memoryCachedPaths.set(cacheKey, target);
      return target;
    }
  } catch {
    /* miss */
  }
  return null;
}

/**
 * Download protected status/chat media to a stable local file.
 * Uses Authorization (not query token) for reliable Android Image/Video loading.
 */
export async function getCachedAuthMediaFile(
  absoluteUrl: string,
  sessionToken?: string | null,
  fallbackExt: "jpg" | "mp4" = "jpg",
): Promise<string> {
  const { cleanUrl, cacheKey, target: targetPath } = cacheTargetForUrl(absoluteUrl, fallbackExt);
  const inflight = downloadLocks.get(cacheKey);
  if (inflight) return inflight;

  const task = (async () => {
    const dir = await ensureCacheDir();
    const ext = mediaExtFromUri(cleanUrl, fallbackExt);
    const target = `${dir}m_${stableKey(cacheKey)}.${ext}`;

    const existing = await FileSystem.getInfoAsync(target);
    if (existing.exists && (existing.size ?? 0) > 256) {
      memoryCachedPaths.set(cacheKey, target);
      return target;
    }

    const auth = needsAuthDownload(cleanUrl) && Boolean(sessionToken);
    const res = await FileSystem.downloadAsync(cleanUrl, target, {
      headers: auth ? (authFetchHeaders(sessionToken) as Record<string, string>) : undefined,
    });
    if (res.status >= 400) {
      await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => {});
      throw new Error(`Download failed (${res.status})`);
    }
    const info = await FileSystem.getInfoAsync(target);
    if (!info.exists || (info.size ?? 0) < 64) {
      await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => {});
      throw new Error("Downloaded media file is empty");
    }
    memoryCachedPaths.set(cacheKey, res.uri);
    return res.uri;
  })();

  downloadLocks.set(cacheKey, task);
  try {
    return await task;
  } finally {
    downloadLocks.delete(cacheKey);
  }
}

/**
 * Resolve media for story playback.
 * Protected status/chat media: download with Authorization (reliable on Android),
 * then show local file. Do not stream images via headers — expo-image often fails.
 */
export function useInstantStatusMediaUri(
  uri: string | undefined,
  sessionToken?: string | null,
  kind: "image" | "video" = "image",
): {
  displayUri: string | null;
  headers?: Record<string, string>;
  failed: boolean;
  loading: boolean;
} {
  const [displayUri, setDisplayUri] = useState<string | null>(null);
  const [headers, setHeaders] = useState<Record<string, string> | undefined>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!uri) {
      setDisplayUri(null);
      setHeaders(undefined);
      setFailed(false);
      return;
    }

    setFailed(false);
    setDisplayUri(null);
    setHeaders(undefined);
    const absolute = (resolvePublicAssetUrl(uri) ?? uri).trim();

    if (absolute.startsWith("file:") || absolute.startsWith("content:") || absolute.startsWith("data:")) {
      setDisplayUri(absolute);
      return;
    }

    if (!(absolute.startsWith("http://") || absolute.startsWith("https://"))) {
      setDisplayUri(absolute);
      return;
    }

    const fallbackExt = kind === "video" ? "mp4" : "jpg";
    const isProtected = needsAuthDownload(absolute);

    void (async () => {
      try {
        // Prefer disk/memory cache.
        const cached = await peekCachedAuthMediaFile(absolute, fallbackExt);
        if (cancelled) return;
        if (cached) {
          setDisplayUri(cached);
          setHeaders(undefined);
          return;
        }

        if (isProtected) {
          // Auth download → local file (works for owner + other viewers).
          const local = await getCachedAuthMediaFile(absolute, sessionToken, fallbackExt);
          if (cancelled) return;
          setDisplayUri(local);
          setHeaders(undefined);
          return;
        }

        setDisplayUri(absolute);
        setHeaders(undefined);
      } catch {
        if (cancelled) return;
        // Last resort: try token URL without headers (some environments).
        if (isProtected && sessionToken) {
          const clean = stripMediaAuthQuery(absolute);
          const streamUri = absolute.includes("token=")
            ? absolute
            : `${clean}${clean.includes("?") ? "&" : "?"}token=${encodeURIComponent(sessionToken)}`;
          setDisplayUri(streamUri);
          setHeaders(undefined);
          return;
        }
        setFailed(true);
        setDisplayUri(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [uri, sessionToken, kind]);

  const loading = Boolean(uri) && !failed && !displayUri;
  return { displayUri: failed ? null : displayUri, headers, failed, loading };
}

/** @deprecated Prefer useInstantStatusMediaUri for stories. */
export function useCachedAuthMediaUri(
  uri: string | undefined,
  sessionToken?: string | null,
  kind: "image" | "video" = "image",
): {
  localUri: string | null;
  failed: boolean;
  loading: boolean;
} {
  const instant = useInstantStatusMediaUri(uri, sessionToken, kind);
  return { localUri: instant.displayUri, failed: instant.failed, loading: instant.loading };
}

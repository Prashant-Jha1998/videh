import * as FileSystem from "expo-file-system/legacy";
import { authFetchHeaders } from "./authenticatedMedia";
import { guessMimeFromFilename } from "./prepareFileUpload";
import { resolvePublicAssetUrl } from "./publicAssetUrl";

const DOC_CACHE_DIR = "videh_documents/";

function safeFileName(name: string, fallback: string, ext: string): string {
  const cleaned = (name || fallback).replace(/[^\w.\-() ]+/g, "_").replace(/^_+|_+$/g, "");
  if (!cleaned) return `${fallback}.${ext}`;
  return cleaned.toLowerCase().endsWith(`.${ext.toLowerCase()}`) ? cleaned : `${cleaned}.${ext}`;
}

function extFromFilename(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  return ext && ext.length <= 8 ? ext : "bin";
}

export function documentCacheKey(mediaUrl: string, filename: string): string {
  let h = 0;
  const s = `${mediaUrl}|${filename}`;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return `doc_${Math.abs(h).toString(36)}`;
}

export async function resolveDocumentCachePath(filename: string, mediaUrl: string): Promise<string> {
  const cacheDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? "";
  if (!cacheDir) throw new Error("No writable cache directory");
  const dir = `${cacheDir}${DOC_CACHE_DIR}`;
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  const ext = extFromFilename(filename);
  return `${dir}${documentCacheKey(mediaUrl, filename)}.${ext}`;
}

async function readFilePrefixBase64(uri: string): Promise<string> {
  try {
    const b64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
      length: 128,
    });
    return b64.slice(0, 128);
  } catch {
    const info = await FileSystem.getInfoAsync(uri);
    const big = info.exists && "size" in info ? (info.size ?? 0) : 0;
    if (big > 200_000) return "";
    const full = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    return full.slice(0, 128);
  }
}

function base64ToAscii(prefixB64: string): string {
  try {
    if (typeof atob === "function") return atob(prefixB64);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return Buffer.from(prefixB64, "base64").toString("ascii");
  } catch {
    return "";
  }
}

/** Reject API error JSON/HTML saved as a “document”. */
export async function assertValidDocumentFile(uri: string, filename: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(uri);
  const bytes = info.exists && "size" in info ? (info.size ?? 0) : 0;
  if (!info.exists || bytes < 32) {
    throw new Error("File is empty or could not be read.");
  }
  const prefix = base64ToAscii(await readFilePrefixBase64(uri));
  const trimmed = prefix.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("<!") || trimmed.startsWith("<html")) {
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
    throw new Error("Document is still syncing. Wait a moment and tap again.");
  }
  const ext = extFromFilename(filename);
  if (ext === "pdf" && !prefix.startsWith("%PDF")) {
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
    throw new Error("Downloaded file is not a valid PDF.");
  }
}

const inFlight = new Map<string, Promise<{ localUri: string; sizeBytes: number }>>();

export async function downloadChatDocument(opts: {
  mediaUrl: string;
  filename: string;
  sessionToken?: string | null;
  onProgress?: (percent: number) => void;
  expectedSizeBytes?: number;
}): Promise<{ localUri: string; sizeBytes: number }> {
  const { mediaUrl, filename, sessionToken, onProgress, expectedSizeBytes } = opts;
  const uri = resolvePublicAssetUrl(mediaUrl) ?? mediaUrl;
  const key = documentCacheKey(uri, filename);
  const existing = inFlight.get(key);
  if (existing) return existing;

  const task = (async () => {
    const target = await resolveDocumentCachePath(filename, uri);
    const cached = await FileSystem.getInfoAsync(target);
    const cachedBytes = cached.exists && "size" in cached ? (cached.size ?? 0) : 0;
    if (cached.exists && cachedBytes > 64) {
      await assertValidDocumentFile(target, filename);
      onProgress?.(100);
      return { localUri: target, sizeBytes: cachedBytes };
    }

    if (!/^https?:\/\//i.test(uri)) {
      throw new Error("Unsupported document location.");
    }

    const headers: Record<string, string> = {};
    if (uri.includes("/api/chats/media/") && sessionToken) {
      Object.assign(headers, (authFetchHeaders(sessionToken) as Record<string, string>) ?? {});
    }

    onProgress?.(0);
    const resumable = FileSystem.createDownloadResumable(
      uri,
      target,
      Object.keys(headers).length ? { headers } : undefined,
      (progress) => {
        const written = progress.totalBytesWritten;
        const total = progress.totalBytesExpectedToWrite;
        let pct: number | null = null;
        if (total && total > 0) {
          pct = Math.min(100, Math.round((written / total) * 100));
        } else if (expectedSizeBytes && expectedSizeBytes > 0) {
          pct = Math.min(99, Math.round((written / expectedSizeBytes) * 100));
        }
        if (pct !== null) onProgress?.(pct);
      },
    );

    const result = await resumable.downloadAsync();
    if (!result || result.status < 200 || result.status >= 300) {
      await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => {});
      if (result?.status === 403) {
        throw new Error("Document is still syncing. Wait a moment and tap again.");
      }
      throw new Error(`Could not download document (${result?.status ?? "network"}).`);
    }

    await assertValidDocumentFile(result.uri, filename);
    const info = await FileSystem.getInfoAsync(result.uri);
    onProgress?.(100);
    const outBytes = info.exists && "size" in info ? (info.size ?? 0) : 0;
    return { localUri: result.uri, sizeBytes: outBytes };
  })();

  inFlight.set(key, task);
  try {
    return await task;
  } finally {
    inFlight.delete(key);
  }
}

export function mimeForDocument(filename: string): string {
  return guessMimeFromFilename(filename);
}

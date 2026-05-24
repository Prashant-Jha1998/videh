import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Linking, Platform } from "react-native";
import { authFetchHeaders } from "./authenticatedMedia";
import { ensureUploadableFileUri, guessMimeFromFilename } from "./prepareFileUpload";
import { resolvePublicAssetUrl } from "./publicAssetUrl";

const MIME_EXTENSION_MAP: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/zip": "zip",
  "application/x-zip-compressed": "zip",
  "text/plain": "txt",
};

function safeFileName(name: string, fallback: string, ext: string): string {
  const cleaned = (name || fallback).replace(/[^\w.\-() ]+/g, "_").replace(/^_+|_+$/g, "");
  if (!cleaned) return `${fallback}.${ext}`;
  return cleaned.toLowerCase().endsWith(`.${ext.toLowerCase()}`) ? cleaned : `${cleaned}.${ext}`;
}

function extFromFilename(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  return ext && ext.length <= 8 ? ext : "bin";
}

async function assertNonEmptyFile(fileUri: string, minBytes = 64): Promise<void> {
  const info = await FileSystem.getInfoAsync(fileUri);
  if (!info.exists || (info.size ?? 0) < minBytes) {
    throw new Error("File is empty or could not be read.");
  }
}

/** Copy content:// / ph:// / fragile file:// to a stable cache file before upload or open. */
async function materializeLocalFile(uri: string, filename: string): Promise<string> {
  if (uri.startsWith("content:") || uri.startsWith("ph://") || uri.startsWith("file:")) {
    return ensureUploadableFileUri(uri, filename);
  }
  return uri;
}

async function downloadRemoteDocument(
  url: string,
  filename: string,
  sessionToken?: string | null,
): Promise<string> {
  const cacheDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? "";
  if (!cacheDir) throw new Error("No writable cache directory");

  const ext = extFromFilename(filename);
  const downloadTarget = `${cacheDir}${safeFileName(filename, `document_${Date.now()}`, ext)}`;
  const headers = url.includes("/api/chats/media/")
    ? (authFetchHeaders(sessionToken) as Record<string, string> | undefined)
    : undefined;

  const downloaded = await FileSystem.downloadAsync(
    url,
    downloadTarget,
    headers ? { headers } : undefined,
  );

  if (downloaded.status < 200 || downloaded.status >= 300) {
    await FileSystem.deleteAsync(downloaded.uri, { idempotent: true }).catch(() => {});
    if (downloaded.status === 403) {
      throw new Error("Document is still syncing. Wait a moment and tap again.");
    }
    throw new Error(`Could not download document (${downloaded.status}).`);
  }

  await assertNonEmptyFile(downloaded.uri);
  return downloaded.uri;
}

/** Download to app cache (Wi‑Fi auto-download); returns local file URI. */
export async function cacheChatDocument(opts: {
  mediaUrl: string;
  filename: string;
  sessionToken?: string | null;
  /** Prefer on-device copy (sender right after send). */
  localUri?: string | null;
}): Promise<string> {
  const { mediaUrl, filename, sessionToken, localUri } = opts;

  if (localUri?.trim()) {
    try {
      const fileUri = await materializeLocalFile(localUri.trim(), filename);
      await assertNonEmptyFile(fileUri);
      return fileUri;
    } catch {
      // fall through to remote
    }
  }

  const uri = resolvePublicAssetUrl(mediaUrl) ?? mediaUrl;
  const cacheDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? "";
  if (!cacheDir) throw new Error("No writable cache directory");

  if (uri.startsWith("file:") || uri.startsWith("content:") || uri.startsWith("ph://")) {
    const fileUri = await materializeLocalFile(uri, filename);
    await assertNonEmptyFile(fileUri);
    return fileUri;
  }

  if (uri.startsWith("data:")) {
    const mimeMatch = uri.match(/^data:([^;]+);base64,/);
    const base64 = uri.replace(/^data:[^;]+;base64,/, "");
    const mime = mimeMatch?.[1] ?? guessMimeFromFilename(filename);
    const ext = MIME_EXTENSION_MAP[mime] ?? extFromFilename(filename);
    const fileUri = `${cacheDir}${safeFileName(filename, `document_${Date.now()}`, ext)}`;
    await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
    await assertNonEmptyFile(fileUri);
    return fileUri;
  }

  if (/^https?:\/\//i.test(uri)) {
    return downloadRemoteDocument(uri, filename, sessionToken);
  }

  throw new Error("Unsupported document location.");
}

async function launchDocumentViewer(fileUri: string, mime: string, filename: string): Promise<void> {
  const getContentUri = (FileSystem as unknown as { getContentUriAsync?: (u: string) => Promise<string> }).getContentUriAsync;
  const openUri = Platform.OS === "android" && getContentUri ? await getContentUri(fileUri) : fileUri;

  if (Platform.OS === "android") {
    try {
      await Linking.openURL(openUri);
      return;
    } catch {
      // fall through
    }
  } else {
    try {
      await Linking.openURL(openUri);
      return;
    } catch {
      // fall through
    }
  }

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType: mime,
      dialogTitle: filename || "Open document",
      UTI: mime,
    });
    return;
  }

  throw new Error("No app available to open this file.");
}

/**
 * Videh-style: use local copy when available, else download with auth + size checks, then open.
 */
export async function openChatDocument(opts: {
  mediaUrl: string;
  filename: string;
  sessionToken?: string | null;
  localUri?: string | null;
}): Promise<void> {
  const { mediaUrl, filename, sessionToken, localUri } = opts;
  const mime = guessMimeFromFilename(filename);
  const fileUri = await cacheChatDocument({ mediaUrl, filename, sessionToken, localUri });

  if (Platform.OS === "web") {
    await Linking.openURL(fileUri);
    return;
  }

  await launchDocumentViewer(fileUri, mime, filename);
}

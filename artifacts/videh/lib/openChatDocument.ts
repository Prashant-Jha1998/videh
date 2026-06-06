import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Linking, Platform } from "react-native";
import { authFetchHeaders } from "./authenticatedMedia";
import {
  assertValidDocumentFile,
  downloadChatDocument,
  mimeForDocument,
  resolveDocumentCachePath,
} from "./chatDocumentDownload";
import { ensureUploadableFileUri } from "./prepareFileUpload";
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

function extFromFilename(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  return ext && ext.length <= 8 ? ext : "bin";
}

async function materializeLocalFile(uri: string, filename: string): Promise<string> {
  if (uri.startsWith("content:") || uri.startsWith("ph://") || uri.startsWith("file:")) {
    return ensureUploadableFileUri(uri, filename);
  }
  return uri;
}

/** Copy content:// / ph:// to stable cache before open. */
async function useLocalCopyIfNeeded(localUri: string, filename: string): Promise<string> {
  const info = await FileSystem.getInfoAsync(localUri);
  if (!info.exists || (info.size ?? 0) < 32) {
    return materializeLocalFile(localUri, filename);
  }
  if (localUri.startsWith("content:") || localUri.startsWith("ph://")) {
    return materializeLocalFile(localUri, filename);
  }
  return localUri;
}

async function openWithSystemApp(fileUri: string, mime: string, filename: string): Promise<void> {
  if (Platform.OS === "web") {
    await Linking.openURL(fileUri);
    return;
  }

  if (Platform.OS === "android") {
    try {
      const IntentLauncher = await import("expo-intent-launcher");
      const contentUri = await FileSystem.getContentUriAsync(fileUri);
      await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
        data: contentUri,
        flags: 1,
        type: mime,
      });
      return;
    } catch {
      /* fall through to share sheet */
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

  throw new Error("No app available to open this file. Install a PDF or Office viewer.");
}

/**
 * Resolve local file (cache / picker copy), optionally download with auth, then open in system app.
 */
export async function openChatDocument(opts: {
  mediaUrl: string;
  filename: string;
  sessionToken?: string | null;
  localUri?: string | null;
  onDownloadProgress?: (percent: number) => void;
  expectedSizeBytes?: number;
}): Promise<{ localUri: string; sizeBytes?: number }> {
  const { mediaUrl, filename, sessionToken, localUri, onDownloadProgress, expectedSizeBytes } = opts;
  const mime = mimeForDocument(filename);
  let fileUri: string | undefined;
  let sizeBytes: number | undefined;

  if (localUri?.trim()) {
    try {
      fileUri = await useLocalCopyIfNeeded(localUri.trim(), filename);
      await assertValidDocumentFile(fileUri, filename);
      const info = await FileSystem.getInfoAsync(fileUri);
      sizeBytes = info.exists && "size" in info ? (info.size ?? undefined) : undefined;
    } catch {
      fileUri = undefined;
    }
  }

  if (!fileUri) {
    const uri = resolvePublicAssetUrl(mediaUrl) ?? mediaUrl;
    if (uri.startsWith("file:") || uri.startsWith("content:") || uri.startsWith("ph://")) {
      fileUri = await materializeLocalFile(uri, filename);
      await assertValidDocumentFile(fileUri, filename);
    } else if (uri.startsWith("data:")) {
      const cacheDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? "";
      if (!cacheDir) throw new Error("No writable cache directory");
      const mimeMatch = uri.match(/^data:([^;]+);base64,/);
      const base64 = uri.replace(/^data:[^;]+;base64,/, "");
      const mimeFromData = mimeMatch?.[1] ?? mime;
      const ext = MIME_EXTENSION_MAP[mimeFromData] ?? extFromFilename(filename);
      fileUri = `${cacheDir}doc_${Date.now()}.${ext}`;
      await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
      await assertValidDocumentFile(fileUri, filename);
    } else if (/^https?:\/\//i.test(uri)) {
      const cached = await resolveDocumentCachePath(filename, uri);
      const hit = await FileSystem.getInfoAsync(cached);
      const hitBytes = hit.exists && "size" in hit ? (hit.size ?? 0) : 0;
      if (hit.exists && hitBytes > 64) {
        try {
          await assertValidDocumentFile(cached, filename);
          fileUri = cached;
          sizeBytes = hitBytes;
          onDownloadProgress?.(100);
        } catch {
          await FileSystem.deleteAsync(cached, { idempotent: true }).catch(() => {});
        }
      }
      if (!fileUri) {
        const dl = await downloadChatDocument({
          mediaUrl,
          filename,
          sessionToken,
          onProgress: onDownloadProgress,
          expectedSizeBytes,
        });
        fileUri = dl.localUri;
        sizeBytes = dl.sizeBytes;
      }
    } else {
      throw new Error("Unsupported document location.");
    }
  }

  await openWithSystemApp(fileUri, mime, filename);
  return { localUri: fileUri, sizeBytes };
}

/** Background cache (Wi‑Fi auto-download). */
export async function cacheChatDocument(opts: {
  mediaUrl: string;
  filename: string;
  sessionToken?: string | null;
  localUri?: string | null;
  onProgress?: (percent: number) => void;
}): Promise<string> {
  const { mediaUrl, filename, sessionToken, localUri, onProgress } = opts;
  if (localUri?.trim()) {
    try {
      const fileUri = await useLocalCopyIfNeeded(localUri.trim(), filename);
      await assertValidDocumentFile(fileUri, filename);
      return fileUri;
    } catch {
      /* remote */
    }
  }
  const { localUri: downloaded } = await downloadChatDocument({
    mediaUrl,
    filename,
    sessionToken,
    onProgress,
  });
  return downloaded;
}

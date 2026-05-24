import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Linking, Platform } from "react-native";
import { authFetchHeaders } from "./authenticatedMedia";
import { guessMimeFromFilename } from "./prepareFileUpload";
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

/** Download to app cache (Wi‑Fi auto-download); returns local file URI. */
export async function cacheChatDocument(opts: {
  mediaUrl: string;
  filename: string;
  sessionToken?: string | null;
}): Promise<string> {
  const { mediaUrl, filename, sessionToken } = opts;
  const uri = resolvePublicAssetUrl(mediaUrl) ?? mediaUrl;
  const cacheDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? "";
  if (!cacheDir) throw new Error("No writable cache directory");

  if (uri.startsWith("file:") || uri.startsWith("content:")) return uri;

  if (uri.startsWith("data:")) {
    const mimeMatch = uri.match(/^data:([^;]+);base64,/);
    const base64 = uri.replace(/^data:[^;]+;base64,/, "");
    const mime = mimeMatch?.[1] ?? guessMimeFromFilename(filename);
    const ext = MIME_EXTENSION_MAP[mime] ?? filename.split(".").pop() ?? "bin";
    const fileUri = `${cacheDir}${safeFileName(filename, `document_${Date.now()}`, ext)}`;
    await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
    return fileUri;
  }

  if (/^https?:\/\//i.test(uri)) {
    const guessedExt = filename.split(".").pop()?.slice(0, 8) || "bin";
    const downloadTarget = `${cacheDir}${safeFileName(filename, `document_${Date.now()}`, guessedExt)}`;
    const headers = uri.includes("/api/chats/media/") ? authFetchHeaders(sessionToken) : undefined;
    const downloaded = await FileSystem.downloadAsync(
      uri,
      downloadTarget,
      headers ? { headers: headers as Record<string, string> } : undefined,
    );
    return downloaded.uri;
  }

  return uri;
}

/**
 * WhatsApp-style: download protected chat media if needed, then open with the system viewer.
 */
export async function openChatDocument(opts: {
  mediaUrl: string;
  filename: string;
  sessionToken?: string | null;
}): Promise<void> {
  const { mediaUrl, filename, sessionToken } = opts;
  const mime = guessMimeFromFilename(filename);
  const fileUri = await cacheChatDocument({ mediaUrl, filename, sessionToken });

  if (Platform.OS === "web") {
    await Linking.openURL(fileUri);
    return;
  }

  const getContentUri = (FileSystem as unknown as { getContentUriAsync?: (u: string) => Promise<string> }).getContentUriAsync;
  const openUri = getContentUri ? await getContentUri(fileUri) : fileUri;
  try {
    await Linking.openURL(openUri);
    return;
  } catch {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, { mimeType: mime, dialogTitle: filename || "Open document" });
      return;
    }
    throw new Error("No app available");
  }
}

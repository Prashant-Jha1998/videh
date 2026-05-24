import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  csv: "text/csv",
  zip: "application/zip",
  rar: "application/vnd.rar",
  "7z": "application/x-7z-compressed",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  aac: "audio/aac",
  mp4: "video/mp4",
  mov: "video/quicktime",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

export function guessMimeFromFilename(name: string, fallback = "application/octet-stream"): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? fallback;
}

function safeUploadName(name: string): string {
  const cleaned = (name || "file").replace(/[^\w.\-() ]+/g, "_").trim();
  return cleaned || `file_${Date.now()}`;
}

/**
 * Android document picker often returns content:// URIs that fetch/FormData cannot read.
 * Copy to app cache as file:// before upload (WhatsApp-style reliability).
 */
export async function ensureUploadableFileUri(uri: string, filename: string): Promise<string> {
  if (!uri) throw new Error("No file selected.");

  if (uri.startsWith("file://")) {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) return uri;
  }

  const cacheDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!cacheDir) throw new Error("Storage unavailable on this device.");

  const safeName = safeUploadName(filename);
  const target = `${cacheDir}upload_${Date.now()}_${safeName}`;

  try {
    await FileSystem.copyAsync({ from: uri, to: target });
    const copied = await FileSystem.getInfoAsync(target);
    if (copied.exists && (copied.size ?? 0) > 0) return target;
  } catch {
    // fall through to base64 read
  }

  if (Platform.OS === "android" || uri.startsWith("content://") || uri.startsWith("ph://")) {
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      await FileSystem.writeAsStringAsync(target, base64, { encoding: FileSystem.EncodingType.Base64 });
      const written = await FileSystem.getInfoAsync(target);
      if (written.exists && (written.size ?? 0) > 0) return target;
    } catch {
      // handled below
    }
  }

  throw new Error("Could not read the selected file. Try another file or check app permissions.");
}

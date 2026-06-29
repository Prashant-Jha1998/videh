import * as FileSystem from "expo-file-system/legacy";
import type { IncomingSharePayload } from "@/lib/incomingSharePayload";

type SendFns = {
  sendMessage: (chatId: string, text: string) => void;
  sendPreparedMediaMessage: (
    chatId: string,
    opts: {
      localUri?: string;
      kind: "image" | "video";
      caption?: string;
    },
  ) => void;
  sendDocumentMessage: (
    chatId: string,
    localUri: string,
    filename: string,
    fileSizeBytes: number,
    mimeType: string,
    opts?: { caption?: string },
  ) => void;
};

function isImageMime(mime?: string): boolean {
  return Boolean(mime?.startsWith("image/"));
}

function isVideoMime(mime?: string): boolean {
  return Boolean(mime?.startsWith("video/"));
}

function isTextMime(mime?: string): boolean {
  return Boolean(mime?.startsWith("text/"));
}

function isDocumentMime(mime?: string): boolean {
  if (!mime) return true;
  if (isImageMime(mime) || isVideoMime(mime) || isTextMime(mime)) return false;
  return true;
}

function defaultCaption(payload: IncomingSharePayload, extra?: string): string {
  const parts = [extra?.trim(), payload.text?.trim(), payload.webUrl?.trim()].filter(Boolean);
  return parts.join("\n").trim();
}

async function readTextFile(path: string): Promise<string | null> {
  try {
    const content = await FileSystem.readAsStringAsync(path);
    return content.trim() || null;
  } catch {
    return null;
  }
}

export async function deliverIncomingShareToChat(
  chatId: string,
  payload: IncomingSharePayload,
  send: SendFns,
  extraCaption?: string,
): Promise<boolean> {
  const caption = defaultCaption(payload, extraCaption);
  const files = payload.files ?? [];
  const mediaFiles = files.filter((f) => isImageMime(f.mimeType) || isVideoMime(f.mimeType));
  const textFiles = files.filter((f) => isTextMime(f.mimeType));
  const docFiles = files.filter((f) => isDocumentMime(f.mimeType));

  if (mediaFiles.length > 0) {
    mediaFiles.forEach((file, index) => {
      const kind = isVideoMime(file.mimeType) ? "video" : "image";
      send.sendPreparedMediaMessage(chatId, {
        localUri: file.path,
        kind,
        caption: index === 0 ? caption : undefined,
      });
    });
    return true;
  }

  const textFileBodies: string[] = [];
  for (const file of textFiles) {
    const body = await readTextFile(file.path);
    if (body) textFileBodies.push(body);
  }
  const textFromFiles = textFileBodies.join("\n\n").trim();
  const textMessage = [caption, textFromFiles].filter(Boolean).join("\n\n").trim();
  if (textMessage) {
    send.sendMessage(chatId, textMessage);
    return true;
  }

  if (docFiles.length > 0) {
    for (let i = 0; i < docFiles.length; i++) {
      const file = docFiles[i]!;
      const name = file.fileName ?? `file-${Date.now()}`;
      let size = 0;
      try {
        const info = await FileSystem.getInfoAsync(file.path);
        size = info.exists ? Number(info.size ?? 0) : 0;
      } catch { /* ignore */ }
      send.sendDocumentMessage(chatId, file.path, name, size, file.mimeType ?? "application/octet-stream", {
        caption: i === 0 ? caption : undefined,
      });
    }
    return true;
  }

  if (caption) {
    send.sendMessage(chatId, caption);
    return true;
  }

  return false;
}

export function sharePreviewKind(payload: IncomingSharePayload | null): "image" | "video" | "text" | "file" | null {
  if (!payload) return null;
  const file = payload.files?.[0];
  if (file) {
    if (isVideoMime(file.mimeType)) return "video";
    if (isImageMime(file.mimeType)) return "image";
    if (isTextMime(file.mimeType)) return "text";
    return "file";
  }
  if (payload.text || payload.webUrl) return "text";
  return null;
}

export function sharePreviewUri(payload: IncomingSharePayload | null): string | undefined {
  const file = payload?.files?.[0];
  if (!file) return undefined;
  if (isImageMime(file.mimeType) || isVideoMime(file.mimeType)) return file.path;
  return undefined;
}

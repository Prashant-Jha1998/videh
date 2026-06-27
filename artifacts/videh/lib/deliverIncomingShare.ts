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

function isDocumentMime(mime?: string): boolean {
  if (!mime) return false;
  return !isImageMime(mime) && !isVideoMime(mime) && !mime.startsWith("text/");
}

function defaultCaption(payload: IncomingSharePayload, extra?: string): string {
  const parts = [extra?.trim(), payload.text?.trim(), payload.webUrl?.trim()].filter(Boolean);
  return parts.join("\n").trim();
}

export async function deliverIncomingShareToChat(
  chatId: string,
  payload: IncomingSharePayload,
  send: SendFns,
  extraCaption?: string,
): Promise<void> {
  const caption = defaultCaption(payload, extraCaption);
  const files = payload.files ?? [];
  const mediaFiles = files.filter((f) => isImageMime(f.mimeType) || isVideoMime(f.mimeType));
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
    return;
  }

  if (docFiles.length > 0) {
    for (let i = 0; i < docFiles.length; i++) {
      const file = docFiles[i]!;
      const name = file.fileName ?? `file-${Date.now()}`;
      send.sendDocumentMessage(chatId, file.path, name, 0, file.mimeType ?? "application/octet-stream", {
        caption: i === 0 ? caption : undefined,
      });
    }
    return;
  }

  if (caption) {
    send.sendMessage(chatId, caption);
  }
}

export function sharePreviewKind(payload: IncomingSharePayload | null): "image" | "video" | "text" | "file" | null {
  if (!payload) return null;
  const file = payload.files?.[0];
  if (file) {
    if (isVideoMime(file.mimeType)) return "video";
    if (isImageMime(file.mimeType)) return "image";
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

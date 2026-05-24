import * as FileSystem from "expo-file-system/legacy";
import { uploadChatMediaWithProgress } from "@/lib/chatMediaUpload";
import type { GifMediaItem } from "@/lib/chatGifApi";

function extFromUrl(url: string, fallback: string): string {
  const m = url.split("?")[0]?.match(/\.([a-z0-9]{2,5})$/i);
  return m?.[1]?.toLowerCase() ?? fallback;
}

/** Download remote GIF/sticker and upload to chat media storage. */
export async function uploadRemoteGifOrSticker(
  item: GifMediaItem,
  sessionToken: string | undefined,
  kind: "gif" | "sticker",
): Promise<string> {
  const ext = extFromUrl(item.sendUrl, kind === "gif" ? "gif" : "webp");
  const mime = ext === "gif" ? "image/gif" : ext === "webp" ? "image/webp" : "image/png";
  const cachePath = `${FileSystem.cacheDirectory}${kind}_${item.id}_${Date.now()}.${ext}`;
  const dl = await FileSystem.downloadAsync(item.sendUrl, cachePath);
  const upload = await uploadChatMediaWithProgress({
    uri: dl.uri,
    mime,
    filename: `${kind}_${item.id}.${ext}`,
    sessionToken,
  });
  return upload.url;
}

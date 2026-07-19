import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import { Platform } from "react-native";

export async function saveVideoUriToLibrary(
  sourceUri: string,
  sessionToken?: string | null,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (Platform.OS === "web") {
    const { downloadUrlToDevice } = await import("./web/webDownload");
    const headers: Record<string, string> = {};
    if (
      (sourceUri.includes("/api/chats/media/") || sourceUri.includes("/api/statuses/media/"))
      && sessionToken
    ) {
      const { authFetchHeaders } = await import("./authenticatedMedia");
      Object.assign(headers, (authFetchHeaders(sessionToken) as Record<string, string>) ?? {});
    }
    return downloadUrlToDevice(sourceUri, `videh_video_${Date.now()}.mp4`, headers);
  }
  const { status } = await MediaLibrary.requestPermissionsAsync();
  if (status !== "granted") {
    return { ok: false, message: "Photo library access is required to save this video." };
  }
  try {
    let localUri = sourceUri;
    if (sourceUri.startsWith("data:video")) {
      const cacheDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? "";
      if (!cacheDir) return { ok: false, message: "Could not access app storage." };
      const ext = sourceUri.includes("video/quicktime") ? "mov" : "mp4";
      const path = `${cacheDir}save_video_${Date.now()}.${ext}`;
      const base64 = sourceUri.replace(/^data:[^;]+;base64,/, "");
      await FileSystem.writeAsStringAsync(path, base64, { encoding: FileSystem.EncodingType.Base64 });
      localUri = path;
    } else if (sourceUri.startsWith("http://") || sourceUri.startsWith("https://")) {
      const cacheDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? "";
      if (!cacheDir) return { ok: false, message: "Could not access app storage." };
      const path = `${cacheDir}download_video_${Date.now()}.mp4`;
      const headers: Record<string, string> = {};
      if (
        (sourceUri.includes("/api/chats/media/") || sourceUri.includes("/api/statuses/media/"))
        && sessionToken
      ) {
        const { authFetchHeaders } = await import("./authenticatedMedia");
        Object.assign(headers, (authFetchHeaders(sessionToken) as Record<string, string>) ?? {});
      }
      const res = await FileSystem.downloadAsync(sourceUri, path, Object.keys(headers).length ? { headers } : undefined);
      localUri = res.uri;
    }
    await MediaLibrary.saveToLibraryAsync(localUri);
    return { ok: true };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Could not save video.";
    return { ok: false, message };
  }
}

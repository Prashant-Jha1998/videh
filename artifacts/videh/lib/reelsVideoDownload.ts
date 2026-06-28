import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import { Alert, Platform } from "react-native";
import type { ReelsVideo } from "./reelsApi";
import { registerDownloadedVideo } from "./reelsLibrary";

function safeFileName(title: string, videoId: number): string {
  const base = title.replace(/[^\w\s-]/g, "").trim().slice(0, 60) || `video_${videoId}`;
  return `${base}_${videoId}.mp4`;
}

async function downloadToCache(url: string, fileName: string): Promise<string> {
  const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!dir) throw new Error("Storage unavailable");
  const dest = `${dir}${fileName}`;
  const info = await FileSystem.getInfoAsync(dest);
  if (info.exists) return dest;
  const result = await FileSystem.downloadAsync(url, dest);
  if (result.status !== 200) throw new Error("Download failed");
  return result.uri;
}

/** Save video file to device gallery / photos. */
export async function saveReelsVideoToDevice(video: ReelsVideo): Promise<void> {
  if (Platform.OS === "web") {
    Alert.alert("Not supported", "Saving to device is available in the mobile app.");
    return;
  }
  const { status } = await MediaLibrary.requestPermissionsAsync();
  if (status !== "granted") {
    Alert.alert("Permission needed", "Allow photo library access to save videos.");
    return;
  }
  const uri = await downloadToCache(video.videoUrl, safeFileName(video.title, video.id));
  await MediaLibrary.createAssetAsync(uri);
  Alert.alert("Saved", `"${video.title}" saved to your gallery.`);
}

/** Download video to app storage (offline copy). */
export async function downloadReelsVideoToApp(video: ReelsVideo): Promise<boolean> {
  if (Platform.OS === "web") {
    Alert.alert("Download", video.videoUrl);
    return false;
  }
  const dir = FileSystem.documentDirectory;
  if (!dir) {
    Alert.alert("Error", "Storage unavailable.");
    return false;
  }
  const fileName = safeFileName(video.title, video.id);
  const dest = `${dir}downloads/${fileName}`;
  await FileSystem.makeDirectoryAsync(`${dir}downloads`, { intermediates: true }).catch(() => {});
  const result = await FileSystem.downloadAsync(video.videoUrl, dest);
  if (result.status !== 200) {
    Alert.alert("Download failed", "Could not download this video. Try again.");
    return false;
  }
  await registerDownloadedVideo(video, dest);
  Alert.alert("Downloaded", `"${video.title}" saved for offline viewing in Library.`);
  return true;
}

import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { Alert } from "react-native";
import { isGifUri } from "./imageEdit";

/** Videh-style limits for chat video (not stories). */
export const MAX_CHAT_VIDEO_DURATION_MS = 3 * 60 * 1000;
export const MAX_CHAT_VIDEO_BYTES = 64 * 1024 * 1024;
export const MAX_CHAT_IMAGE_BYTES = 16 * 1024 * 1024;
export const MAX_CHAT_IMAGES_BATCH = 30;

export type PickedChatMedia = {
  uri: string;
  kind: "image" | "video";
  durationMs?: number;
  fileSize?: number;
  isGif?: boolean;
};

export const CHAT_VIDEO_PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ["images", "videos"],
  allowsEditing: false,
  allowsMultipleSelection: true,
  selectionLimit: MAX_CHAT_IMAGES_BATCH,
  quality: 1,
  base64: false,
  videoMaxDuration: MAX_CHAT_VIDEO_DURATION_MS / 1000,
  videoExportPreset: ImagePicker.VideoExportPreset.MediumQuality,
};

export const CHAT_VIEW_ONCE_PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ["images", "videos"],
  allowsEditing: true,
  allowsMultipleSelection: false,
  quality: 1,
  base64: false,
  videoMaxDuration: MAX_CHAT_VIDEO_DURATION_MS / 1000,
  videoExportPreset: ImagePicker.VideoExportPreset.MediumQuality,
};

export const CHAT_CAMERA_VIDEO_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ["videos"],
  allowsEditing: true,
  quality: 1,
  base64: false,
  videoMaxDuration: MAX_CHAT_VIDEO_DURATION_MS / 1000,
  videoExportPreset: ImagePicker.VideoExportPreset.MediumQuality,
};

export const CHAT_CAMERA_PHOTO_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ["images"],
  allowsEditing: true,
  quality: 1,
  base64: false,
};

export async function validatePickedMedia(asset: ImagePicker.ImagePickerAsset): Promise<PickedChatMedia | null> {
  const mime = asset.mimeType ?? "";
  const isGif = mime === "image/gif" || isGifUri(asset.uri);
  const kind = asset.type === "video" ? "video" : "image";
  let fileSize = asset.fileSize ?? 0;
  if (!fileSize && asset.uri) {
    try {
      const info = await FileSystem.getInfoAsync(asset.uri);
      if (info.exists && "size" in info && typeof info.size === "number") fileSize = info.size;
    } catch {
      /* ignore */
    }
  }
  if (kind === "video") {
    const durationMs = typeof asset.duration === "number" ? asset.duration : 0;
    if (durationMs > MAX_CHAT_VIDEO_DURATION_MS) {
      Alert.alert("Video too long", "Maximum video length is 3 minutes.");
      return null;
    }
    if (fileSize > MAX_CHAT_VIDEO_BYTES) {
      Alert.alert("Video too large", "Maximum video size is 64 MB. Try a shorter clip.");
      return null;
    }
  } else if (fileSize > MAX_CHAT_IMAGE_BYTES) {
    Alert.alert("Photo too large", "Maximum photo size is 16 MB.");
    return null;
  }
  return { uri: asset.uri, kind, durationMs: asset.duration ?? undefined, fileSize: fileSize || undefined, isGif };
}

export async function validatePickedAssets(assets: ImagePicker.ImagePickerAsset[]): Promise<PickedChatMedia[]> {
  const out: PickedChatMedia[] = [];
  for (const asset of assets.slice(0, MAX_CHAT_IMAGES_BATCH)) {
    const picked = await validatePickedMedia(asset);
    if (picked) out.push(picked);
  }
  return out;
}

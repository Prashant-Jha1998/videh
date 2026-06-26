import { Alert, Platform } from "react-native";
import type { Status } from "@/context/AppContext";
import { saveImageUriToLibrary } from "./saveImageToLibrary";
import { saveVideoUriToLibrary } from "./saveVideoToLibrary";

export async function saveStatusToGallery(
  status: Pick<Status, "type" | "mediaUrl">,
  sessionToken?: string | null,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (Platform.OS === "web") {
    return { ok: false, message: "Saving to gallery is available in the mobile app." };
  }
  if (!status.mediaUrl || (status.type !== "image" && status.type !== "video")) {
    return { ok: false, message: "Only photo and video stories can be saved to your gallery." };
  }
  const saver = status.type === "video" ? saveVideoUriToLibrary : saveImageUriToLibrary;
  return saver(status.mediaUrl, sessionToken);
}

export async function saveStatusToGalleryWithAlert(
  status: Pick<Status, "type" | "mediaUrl">,
  sessionToken?: string | null,
): Promise<void> {
  const res = await saveStatusToGallery(status, sessionToken);
  if (res.ok) {
    Alert.alert(
      "Saved",
      status.type === "video" ? "Story video saved to your gallery." : "Story photo saved to your gallery.",
    );
  } else {
    Alert.alert("Could not save", res.message);
  }
}

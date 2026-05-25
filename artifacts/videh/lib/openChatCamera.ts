import { Audio } from "expo-av";
import * as ImagePicker from "expo-image-picker";
import { Alert, InteractionManager, Platform } from "react-native";
import { CHAT_CAMERA_PHOTO_OPTIONS, CHAT_CAMERA_VIDEO_OPTIONS } from "./chatMediaPolicy";

function afterUiSettled(ms = Platform.OS === "android" ? 320 : 80): Promise<void> {
  return new Promise((resolve) => {
    InteractionManager.runAfterInteractions(() => {
      setTimeout(resolve, ms);
    });
  });
}

async function ensureCameraPermission(forVideo: boolean): Promise<boolean> {
  const current = await ImagePicker.getCameraPermissionsAsync();
  if (current.status !== ImagePicker.PermissionStatus.GRANTED) {
    const requested = await ImagePicker.requestCameraPermissionsAsync();
    if (requested.status !== ImagePicker.PermissionStatus.GRANTED) {
      Alert.alert(
        "Camera permission",
        "Allow Camera access for Videh in Settings to take photos and videos.",
      );
      return false;
    }
  }

  if (forVideo) {
    const mic = await Audio.getPermissionsAsync();
    if (!mic.granted) {
      const micReq = await Audio.requestPermissionsAsync();
      if (!micReq.granted) {
        Alert.alert(
          "Microphone permission",
          "Allow Microphone access to record video with sound.",
        );
        return false;
      }
    }
  }

  return true;
}

/** Launch device camera for chat photo (call after any modal/alert is closed). */
export async function launchChatPhotoCamera(): Promise<ImagePicker.ImagePickerResult | null> {
  if (!(await ensureCameraPermission(false))) return null;
  await afterUiSettled();
  try {
    return await ImagePicker.launchCameraAsync({
      ...CHAT_CAMERA_PHOTO_OPTIONS,
      allowsEditing: Platform.OS === "ios",
    });
  } catch (e) {
    Alert.alert("Camera error", e instanceof Error ? e.message : "Could not open the camera.");
    return null;
  }
}

/** Launch device camera for chat video recording. */
export async function launchChatVideoCamera(): Promise<ImagePicker.ImagePickerResult | null> {
  if (!(await ensureCameraPermission(true))) return null;
  await afterUiSettled();
  try {
    return await ImagePicker.launchCameraAsync({
      ...CHAT_CAMERA_VIDEO_OPTIONS,
      allowsEditing: Platform.OS === "ios",
    });
  } catch (e) {
    Alert.alert("Camera error", e instanceof Error ? e.message : "Could not open the video camera.");
    return null;
  }
}

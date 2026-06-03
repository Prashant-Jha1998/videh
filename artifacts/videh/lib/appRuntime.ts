import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform } from "react-native";

/** True when running inside the generic Expo Go app (no native call modules). */
export function isExpoGo(): boolean {
  if (Platform.OS === "web") return false;
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

/** Installed Videh binary (dev client, preview APK, or store build). */
export function isVidehNativeBinary(): boolean {
  if (Platform.OS === "web") return true;
  const env = Constants.executionEnvironment;
  return env === ExecutionEnvironment.Bare || env === ExecutionEnvironment.Standalone;
}

export function nativeBuildRequiredMessage(): string {
  return (
    "Videh calls, group WebRTC, and CallKeep need a full app build. " +
    "Expo Go cannot load react-native-webrtc or phone-call integrations."
  );
}

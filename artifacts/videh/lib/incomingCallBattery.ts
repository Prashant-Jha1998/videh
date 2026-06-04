import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const PROMPTED_KEY = "videh_battery_opt_prompted_v1";

/** One-time prompt so OEM battery savers do not kill incoming call polling. */
export async function maybePromptDisableBatteryOptimization(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    const done = await AsyncStorage.getItem(PROMPTED_KEY);
    if (done === "1") return;
    await AsyncStorage.setItem(PROMPTED_KEY, "1");
    const IntentLauncher = await import("expo-intent-launcher");
    const pkg = "com.videh.app";
    try {
      await IntentLauncher.startActivityAsync("android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS", {
        data: `package:${pkg}`,
      });
      return;
    } catch {
      /* fall through */
    }
    await IntentLauncher.startActivityAsync("android.settings.APPLICATION_DETAILS_SETTINGS", {
      data: `package:${pkg}`,
    });
  } catch {
    /* user dismissed or OEM blocked */
  }
}

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert, InteractionManager, Linking, Platform } from "react-native";
import Constants from "expo-constants";

const PROMPTED_KEY = "videh_battery_opt_prompted_v1";
const FSI_PROMPTED_KEY = "videh_fullscreen_intent_prompted_v1";

function androidPackageName(): string {
  return Constants.expoConfig?.android?.package || "com.videh.app";
}

async function openAndroidSettingsSafe(action: string, pkg: string): Promise<boolean> {
  try {
    const IntentLauncher = await import("expo-intent-launcher");
    await IntentLauncher.startActivityAsync(action, { data: `package:${pkg}` });
    return true;
  } catch {
    try {
      await Linking.openSettings();
      return true;
    } catch {
      return false;
    }
  }
}

function afterUiSettled(fn: () => void, delayMs = 1500): void {
  InteractionManager.runAfterInteractions(() => {
    setTimeout(fn, delayMs);
  });
}

/** One-time prompt so OEM battery savers do not kill incoming call polling. */
export async function maybePromptDisableBatteryOptimization(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    const done = await AsyncStorage.getItem(PROMPTED_KEY);
    if (done === "1") return;

    afterUiSettled(() => {
      Alert.alert(
        "Better call delivery",
        "Allow Videh to run unrestricted so incoming calls still ring when the phone is locked.",
        [
          { text: "Not now", style: "cancel", onPress: () => { void AsyncStorage.setItem(PROMPTED_KEY, "1"); } },
          {
            text: "Open settings",
            onPress: () => {
              void (async () => {
                await AsyncStorage.setItem(PROMPTED_KEY, "1");
                const pkg = androidPackageName();
                const ok = await openAndroidSettingsSafe(
                  "android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS",
                  pkg,
                );
                if (!ok) {
                  await openAndroidSettingsSafe("android.settings.APPLICATION_DETAILS_SETTINGS", pkg);
                }
              })();
            },
          },
        ],
      );
    }, 2000);
  } catch {
    /* never crash startup */
  }
}

/**
 * Android 14+: USE_FULL_SCREEN_INTENT is not enough — user must grant special access
 * for lock-screen full-screen incoming call UI.
 * Ask with Alert first; never auto-jump into system settings on cold start (OEM crash risk).
 */
export async function maybePromptFullScreenIntentPermission(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    const done = await AsyncStorage.getItem(FSI_PROMPTED_KEY);
    if (done === "1") return;

    // Run after battery prompt window so we do not open two settings screens in a row.
    afterUiSettled(() => {
      Alert.alert(
        "Full-screen call alerts",
        "Allow Videh to show incoming calls over the lock screen for faster pickup.",
        [
          { text: "Not now", style: "cancel", onPress: () => { void AsyncStorage.setItem(FSI_PROMPTED_KEY, "1"); } },
          {
            text: "Open settings",
            onPress: () => {
              void (async () => {
                await AsyncStorage.setItem(FSI_PROMPTED_KEY, "1");
                const pkg = androidPackageName();
                const ok = await openAndroidSettingsSafe(
                  "android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENT",
                  pkg,
                );
                if (!ok) {
                  await openAndroidSettingsSafe("android.settings.APPLICATION_DETAILS_SETTINGS", pkg);
                }
              })();
            },
          },
        ],
      );
    }, 5000);
  } catch {
    /* never crash startup */
  }
}

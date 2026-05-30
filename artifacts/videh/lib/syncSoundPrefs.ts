import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { getApiUrl } from "./api";
import { agentDebugLog } from "./agentDebugLog";
import { safeJsonParse } from "./safeJson";
import { getSoundPrefs, type SoundPrefs } from "./soundPrefs";

let syncTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleSoundPrefsSync(): void {
  if (Platform.OS === "web") return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void syncSoundPrefsToServer();
  }, 400);
}

export async function syncSoundPrefsToServer(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const stored = await AsyncStorage.getItem("videh_user");
    const user = safeJsonParse<{ dbId?: number; sessionToken?: string } | null>(stored, null);
    if (!user?.dbId || !user.sessionToken) return;
    const prefs = await getSoundPrefs();
    const res = await fetch(`${getApiUrl()}/api/users/${user.dbId}/sound-prefs`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user.sessionToken}`,
      },
      body: JSON.stringify(prefsBody(prefs)),
    });
    agentDebugLog(
      "syncSoundPrefs.ts:sync",
      "server sound prefs sync",
      { ok: res.ok, status: res.status, globalMessage: prefs.globalMessageSound },
      "H6",
      "post-fix",
    );
  } catch (e) {
    agentDebugLog("syncSoundPrefs.ts:sync", "sync failed", { err: String(e) }, "H6", "post-fix");
  }
}

function prefsBody(prefs: SoundPrefs) {
  return {
    globalMessageSound: prefs.globalMessageSound,
    globalGroupMessageSound: prefs.globalGroupMessageSound,
    globalCallSound: prefs.globalCallSound,
    chatMessageSounds: prefs.chatMessageSounds,
    chatPresets: prefs.chatPresets,
  };
}

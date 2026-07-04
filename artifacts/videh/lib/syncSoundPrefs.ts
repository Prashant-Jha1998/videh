import { Platform } from "react-native";
import { getApiUrl } from "./api";
import { loadStoredUser } from "./secureUserStorage";
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
    const user = await loadStoredUser<{ dbId?: number; sessionToken?: string }>();
    if (!user?.dbId || !user.sessionToken) return;
    const prefs = await getSoundPrefs();
    await fetch(`${getApiUrl()}/api/users/${user.dbId}/sound-prefs`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user.sessionToken}`,
      },
      body: JSON.stringify(prefsBody(prefs)),
    });
  } catch {
    /* ignore — prefs stay local */
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

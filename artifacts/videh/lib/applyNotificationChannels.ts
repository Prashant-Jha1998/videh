import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { agentDebugLog } from "./agentDebugLog";
import {
  MESSAGE_SOUNDS,
  notificationSoundFilename,
  type MessageSoundId,
} from "./premiumSounds";
import { getEffectiveMessageSound, getSoundPrefs } from "./soundPrefs";
import { VIDEH_CALLS_CHANNEL_ID, VIDEH_PUSH_CHANNEL_ID } from "./pushNotifications";

const CHANNEL_PREFIX = "videh_msg_";

export function messageChannelId(soundId: MessageSoundId): string {
  if (soundId === "msg_default") return VIDEH_PUSH_CHANNEL_ID;
  return `${CHANNEL_PREFIX}${soundId}`;
}

/** Register Android channels for all premium message tones + call channel. */
export async function applyVidehNotificationSounds(): Promise<void> {
  if (Platform.OS !== "android") return;
  const prefs = await getSoundPrefs();

  for (const entry of MESSAGE_SOUNDS) {
    const sid = entry.id as MessageSoundId;
    const id = messageChannelId(sid);
    const soundName = notificationSoundFilename(sid);
    await Notifications.setNotificationChannelAsync(id, {
      name: sid === "msg_default" ? "Messages" : `Messages · ${entry.label}`,
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      sound: soundName,
    });
  }

  const callSound = prefs.globalCallSound === "none" ? undefined : prefs.globalCallSound;
  await Notifications.setNotificationChannelAsync(VIDEH_CALLS_CHANNEL_ID, {
    name: "Calls",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 1000, 500, 1000, 500, 1000],
    sound: callSound,
    bypassDnd: true,
    enableLights: true,
    lightColor: "#00A884",
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

export async function resolveMessageNotificationSound(
  chatId: string,
  isGroup: boolean,
): Promise<{ sound: string; channelId?: string }> {
  const prefs = await getSoundPrefs();
  const soundId = getEffectiveMessageSound(prefs, chatId, isGroup);
  const sound = notificationSoundFilename(soundId);
  const resolved =
    Platform.OS === "android"
      ? { sound, channelId: messageChannelId(soundId) }
      : { sound: sound === "default" ? "default" : `${sound}.wav` };
  agentDebugLog(
    "applyNotificationChannels.ts:resolveMessageNotificationSound",
    "resolved notification sound",
    { chatId, isGroup, soundId, platform: Platform.OS, ...resolved },
    "H2",
  );
  return resolved;
}

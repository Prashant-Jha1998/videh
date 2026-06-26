import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { agentDebugLog } from "./agentDebugLog";
import {
  CALL_RINGTONES,
  MESSAGE_SOUNDS,
  iosNotificationSoundName,
  notificationCallSoundFilename,
  notificationSoundFilename,
  type CallSoundId,
  type MessageSoundId,
} from "./premiumSounds";
import { getEffectiveMessageSound, getSoundPrefs } from "./soundPrefs";
import { VIDEH_CALLS_CHANNEL_ID, VIDEH_PUSH_CHANNEL_ID } from "./pushNotifications";

const CHANNEL_PREFIX = "videh_msg_";
const CALL_CHANNEL_PREFIX = "videh_call_";

export function messageChannelId(soundId: MessageSoundId): string {
  if (soundId === "msg_default") return VIDEH_PUSH_CHANNEL_ID;
  return `${CHANNEL_PREFIX}${soundId}`;
}

export function callChannelId(soundId: CallSoundId): string {
  if (soundId === "none") return `${VIDEH_CALLS_CHANNEL_ID}_silent`;
  if (soundId === "call_default") return VIDEH_CALLS_CHANNEL_ID;
  return `${CALL_CHANNEL_PREFIX}${soundId}`;
}

/** Register Android channels for all premium message + call tones. */
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

  for (const entry of CALL_RINGTONES) {
    const sid = entry.id as CallSoundId;
    const id = callChannelId(sid);
    const soundName = notificationCallSoundFilename(sid);
    await Notifications.setNotificationChannelAsync(id, {
      name: sid === "call_default" ? "Calls" : sid === "none" ? "Calls · Silent" : `Calls · ${entry.label}`,
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 1000, 500, 1000, 500, 1000],
      sound: soundName,
      bypassDnd: true,
      enableLights: true,
      lightColor: "#5B4FE8",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }

  agentDebugLog(
    "applyNotificationChannels.ts:applyVidehNotificationSounds",
    "channels updated",
    {
      globalMessage: prefs.globalMessageSound,
      globalCall: prefs.globalCallSound,
      callChannel: callChannelId(prefs.globalCallSound),
    },
    "H2",
  );
}

export async function resolveMessageNotificationSound(
  chatId: string,
  isGroup: boolean,
): Promise<{ sound: string | undefined; channelId?: string; soundId: MessageSoundId }> {
  const prefs = await getSoundPrefs();
  const soundId = getEffectiveMessageSound(prefs, chatId, isGroup);
  const sound = notificationSoundFilename(soundId);
  const resolved =
    Platform.OS === "android"
      ? { sound, channelId: messageChannelId(soundId), soundId }
      : { sound: iosNotificationSoundName(sound), soundId };
  agentDebugLog(
    "applyNotificationChannels.ts:resolveMessageNotificationSound",
    "resolved notification sound",
    { chatId, isGroup, soundId, platform: Platform.OS, ...resolved },
    "H2",
  );
  return resolved;
}

export async function resolveCallNotificationSound(): Promise<{
  sound: string | undefined;
  channelId?: string;
  soundId: CallSoundId;
}> {
  const prefs = await getSoundPrefs();
  const soundId = prefs.globalCallSound;
  const baseName = notificationCallSoundFilename(soundId);
  if (Platform.OS === "android") {
    return { sound: baseName, channelId: callChannelId(soundId), soundId };
  }
  return { sound: iosNotificationSoundName(baseName), channelId: callChannelId(soundId), soundId };
}

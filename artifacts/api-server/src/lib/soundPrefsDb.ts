import { query } from "./db";
import { EXPO_ANDROID_CHANNEL_ID } from "./expoPush";

const MSG_SOUNDS = new Set([
  "msg_default",
  "msg_chime",
  "msg_soft",
  "msg_alert",
  "msg_vip",
  "msg_romantic",
  "msg_business",
  "msg_family",
  "msg_office",
  "msg_nature",
  "msg_festival",
  "msg_gaming",
]);

const PRESET_TO_SOUND: Record<string, string> = {
  romantic: "msg_romantic",
  professional: "msg_business",
  family: "msg_family",
  office: "msg_office",
  vip: "msg_vip",
  nature: "msg_nature",
  gaming: "msg_gaming",
};

export type UserSoundPrefsRow = {
  global_message_sound: string;
  global_group_message_sound: string;
  global_call_sound: string;
  chat_message_sounds: Record<string, string>;
  chat_presets: Record<string, string>;
};

const DEFAULTS: UserSoundPrefsRow = {
  global_message_sound: "msg_default",
  global_group_message_sound: "msg_default",
  global_call_sound: "call_default",
  chat_message_sounds: {},
  chat_presets: {},
};

function validMsg(id: string): string {
  return MSG_SOUNDS.has(id) ? id : "msg_default";
}

export async function getUserSoundPrefs(userId: number): Promise<UserSoundPrefsRow> {
  try {
    const r = await query(
      `SELECT global_message_sound, global_group_message_sound, global_call_sound,
              chat_message_sounds, chat_presets
       FROM user_sound_prefs WHERE user_id = $1`,
      [userId],
    );
    if (!r.rows[0]) return { ...DEFAULTS };
    const row = r.rows[0] as UserSoundPrefsRow;
    return {
      global_message_sound: validMsg(String(row.global_message_sound)),
      global_group_message_sound: validMsg(String(row.global_group_message_sound)),
      global_call_sound: String(row.global_call_sound || "call_default"),
      chat_message_sounds:
        row.chat_message_sounds && typeof row.chat_message_sounds === "object"
          ? (row.chat_message_sounds as Record<string, string>)
          : {},
      chat_presets:
        row.chat_presets && typeof row.chat_presets === "object"
          ? (row.chat_presets as Record<string, string>)
          : {},
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function upsertUserSoundPrefs(userId: number, prefs: Partial<UserSoundPrefsRow>): Promise<void> {
  const current = await getUserSoundPrefs(userId);
  const next: UserSoundPrefsRow = {
    global_message_sound: validMsg(String(prefs.global_message_sound ?? current.global_message_sound)),
    global_group_message_sound: validMsg(
      String(prefs.global_group_message_sound ?? current.global_group_message_sound),
    ),
    global_call_sound: String(prefs.global_call_sound ?? current.global_call_sound),
    chat_message_sounds: prefs.chat_message_sounds ?? current.chat_message_sounds,
    chat_presets: prefs.chat_presets ?? current.chat_presets,
  };
  await query(
    `INSERT INTO user_sound_prefs (
       user_id, global_message_sound, global_group_message_sound, global_call_sound,
       chat_message_sounds, chat_presets, updated_at
     ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       global_message_sound = EXCLUDED.global_message_sound,
       global_group_message_sound = EXCLUDED.global_group_message_sound,
       global_call_sound = EXCLUDED.global_call_sound,
       chat_message_sounds = EXCLUDED.chat_message_sounds,
       chat_presets = EXCLUDED.chat_presets,
       updated_at = NOW()`,
    [
      userId,
      next.global_message_sound,
      next.global_group_message_sound,
      next.global_call_sound,
      JSON.stringify(next.chat_message_sounds),
      JSON.stringify(next.chat_presets),
    ],
  );
}

export function effectiveMessageSoundId(
  prefs: UserSoundPrefsRow,
  chatId: string,
  isGroup: boolean,
): string {
  const custom = prefs.chat_message_sounds[chatId];
  if (custom && MSG_SOUNDS.has(custom)) return custom;
  const preset = prefs.chat_presets[chatId];
  if (preset && preset !== "default" && PRESET_TO_SOUND[preset]) {
    return PRESET_TO_SOUND[preset];
  }
  return isGroup ? prefs.global_group_message_sound : prefs.global_message_sound;
}

export async function resolveUserMessageSoundId(
  userId: number,
  chatId: string,
  isGroup: boolean,
): Promise<string> {
  const prefs = await getUserSoundPrefs(userId);
  return effectiveMessageSoundId(prefs, chatId, isGroup);
}

/** Android channel + sound name (must match Videh app `applyNotificationChannels`). */
export function fcmMessageSoundAndroid(soundId: string): { channelId: string; sound: string } {
  if (soundId === "msg_default") {
    return { channelId: EXPO_ANDROID_CHANNEL_ID, sound: "default" };
  }
  return { channelId: `videh_msg_${soundId}`, sound: soundId };
}

export function fcmMessageSoundIos(soundId: string): string {
  return soundId === "msg_default" ? "default" : `${soundId}.wav`;
}

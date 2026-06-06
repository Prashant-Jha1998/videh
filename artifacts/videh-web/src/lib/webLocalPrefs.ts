const PREFIX = "videh_web_";

function key(name: string) {
  return `${PREFIX}${name}`;
}

export function loadString(name: string, fallback: string): string {
  try {
    return localStorage.getItem(key(name)) ?? fallback;
  } catch {
    return fallback;
  }
}

export function saveString(name: string, value: string) {
  try {
    localStorage.setItem(key(name), value);
  } catch {
    /* ignore */
  }
}

export function loadBool(name: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key(name));
    if (raw === null) return fallback;
    return raw === "true";
  } catch {
    return fallback;
  }
}

export function saveBool(name: string, value: boolean) {
  saveString(name, value ? "true" : "false");
}

export const WEB_PREFS = {
  appThemeId: "app_theme_id",
  appThemeTrialStart: "app_theme_trial_start",
  chatTheme: "chat_theme",
  chatFont: "chat_font",
  chatWallpaper: "chat_wallpaper",
  enterIsSend: "enter_is_send",
  mediaVisibility: "media_visibility",
  chatBackup: "chat_backup",
  emojiVariant: "emoji_variant",
  msgNotifs: "msg_notifs",
  msgVibrate: "msg_vibrate",
  msgPreview: "msg_preview",
  groupNotifs: "group_notifs",
  callNotifs: "call_notifs",
  callVibrate: "call_vibrate",
  statusNotifs: "status_notifs",
  reactionNotifs: "reaction_notifs",
  autoDownloadImages: "auto_dl_images",
  autoDownloadVideos: "auto_dl_videos",
  autoDownloadDocs: "auto_dl_docs",
  fontSize: "font_size",
  highContrast: "high_contrast",
  reduceMotion: "reduce_motion",
  boldText: "bold_text",
  messageSound: "message_sound",
  groupSound: "group_sound",
  callRingtone: "call_ringtone",
  locale: "locale",
} as const;

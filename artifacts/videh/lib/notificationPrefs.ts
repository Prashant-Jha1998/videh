import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl } from "@/lib/api";

const KEY = "videh_notification_prefs_v1";

export type NotificationPrefs = {
  messages: boolean;
  groups: boolean;
  calls: boolean;
  status: boolean;
  reactions: boolean;
  messageVibrate: boolean;
  groupVibrate: boolean;
  preview: "always" | "name" | "none";
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  messages: true,
  groups: true,
  calls: true,
  status: true,
  reactions: true,
  messageVibrate: true,
  groupVibrate: true,
  preview: "always",
};

export async function loadNotificationPrefs(opts?: {
  userId?: number;
  sessionToken?: string | null;
}): Promise<NotificationPrefs> {
  let local: NotificationPrefs = { ...DEFAULT_NOTIFICATION_PREFS };
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<NotificationPrefs>;
      local = { ...DEFAULT_NOTIFICATION_PREFS, ...parsed };
    }
  } catch {
    /* use defaults */
  }
  if (!opts?.userId || !opts.sessionToken) return local;
  try {
    const r = await fetch(`${getApiUrl()}/api/users/${opts.userId}/notification-prefs`, {
      headers: { Authorization: `Bearer ${opts.sessionToken}` },
    });
    const d = (await r.json()) as { success?: boolean; prefs?: Partial<NotificationPrefs> };
    if (r.ok && d.success && d.prefs) {
      const merged = { ...DEFAULT_NOTIFICATION_PREFS, ...d.prefs };
      await AsyncStorage.setItem(KEY, JSON.stringify(merged));
      return merged;
    }
  } catch {
    /* keep local */
  }
  return local;
}

export async function saveNotificationPrefs(
  prefs: NotificationPrefs,
  opts?: { userId?: number; sessionToken?: string | null },
): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(prefs));
  if (!opts?.userId || !opts.sessionToken) return;
  try {
    await fetch(`${getApiUrl()}/api/users/${opts.userId}/notification-prefs`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.sessionToken}`,
      },
      body: JSON.stringify(prefs),
    });
  } catch {
    /* local prefs still apply */
  }
}

export function previewLabel(preview: NotificationPrefs["preview"]): string {
  if (preview === "name") return "Only show sender name";
  if (preview === "none") return "No preview";
  return "Always show preview";
}

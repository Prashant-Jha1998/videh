import AsyncStorage from "@react-native-async-storage/async-storage";
import { CHAT_STORAGE, loadOptionalString } from "@/lib/chatSettings";
import { backupChatsQuietly } from "@/lib/chatExport";

const DAY_MS = 24 * 60 * 60 * 1000;

export function backupIntervalMs(freq: string): number | null {
  switch (freq) {
    case "Daily":
      return DAY_MS;
    case "Weekly":
      return 7 * DAY_MS;
    case "Monthly":
      return 30 * DAY_MS;
    default:
      return null;
  }
}

export async function loadBackupFrequency(): Promise<string> {
  return loadOptionalString(CHAT_STORAGE.backup, "Weekly");
}

export async function loadLastBackupAt(): Promise<number | null> {
  const raw = await AsyncStorage.getItem(CHAT_STORAGE.backupLastAt);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export async function markBackupCompleted(at = Date.now()): Promise<void> {
  await AsyncStorage.setItem(CHAT_STORAGE.backupLastAt, String(at));
}

export function isAutoBackupDue(freq: string, lastAt: number | null, now = Date.now()): boolean {
  const interval = backupIntervalMs(freq);
  if (interval == null) return false;
  if (lastAt == null) return true;
  return now - lastAt >= interval;
}

/** Silent local JSON backup when schedule is due. No share sheet. */
export async function runScheduledChatBackupIfDue(
  chats: Parameters<typeof backupChatsQuietly>[0],
  myName: string,
): Promise<{ ran: boolean; path?: string }> {
  if (chats.length === 0) return { ran: false };
  const [freq, lastAt] = await Promise.all([loadBackupFrequency(), loadLastBackupAt()]);
  if (!isAutoBackupDue(freq, lastAt)) return { ran: false };
  const path = await backupChatsQuietly(chats, myName);
  await markBackupCompleted();
  return { ran: true, path };
}

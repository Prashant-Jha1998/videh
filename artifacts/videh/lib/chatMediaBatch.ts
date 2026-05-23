import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "videh_pending_batch_media_v1";

export type PendingBatchMedia = {
  chatId: string;
  viewOnce: boolean;
  items: Array<{ uri: string; kind: "image" | "video" }>;
};

export async function stashBatchMedia(payload: PendingBatchMedia): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(payload));
}

export async function takeBatchMedia(): Promise<PendingBatchMedia | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  await AsyncStorage.removeItem(KEY);
  try {
    return JSON.parse(raw) as PendingBatchMedia;
  } catch {
    return null;
  }
}

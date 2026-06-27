import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ShareIntent } from "expo-share-intent";

const KEY = "videh_incoming_share_v1";

export type IncomingShareFile = {
  path: string;
  mimeType?: string;
  fileName?: string;
};

export type IncomingSharePayload = {
  text?: string;
  webUrl?: string;
  files?: IncomingShareFile[];
  receivedAt: number;
};

export function shareIntentToPayload(intent: ShareIntent): IncomingSharePayload {
  return {
    text: intent.text?.trim() || undefined,
    webUrl: intent.webUrl?.trim() || undefined,
    files: intent.files?.map((f) => ({
      path: f.path,
      mimeType: f.mimeType,
      fileName: f.fileName,
    })),
    receivedAt: Date.now(),
  };
}

export async function stashIncomingShare(intent: ShareIntent): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(shareIntentToPayload(intent)));
}

export async function takeIncomingShare(): Promise<IncomingSharePayload | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  await AsyncStorage.removeItem(KEY);
  try {
    return JSON.parse(raw) as IncomingSharePayload;
  } catch {
    return null;
  }
}

export async function peekIncomingShare(): Promise<IncomingSharePayload | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as IncomingSharePayload;
  } catch {
    return null;
  }
}

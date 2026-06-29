import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import type { ShareIntent } from "expo-share-intent";
import { ensureUploadableFileUri } from "@/lib/prepareFileUpload";

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

function combineTextParts(...parts: Array<string | null | undefined>): string | undefined {
  const merged = parts.map((p) => p?.trim()).filter(Boolean).join("\n").trim();
  return merged || undefined;
}

export function shareIntentToPayload(intent: ShareIntent): IncomingSharePayload {
  const text = combineTextParts(intent.text, intent.meta?.title);
  const webUrl = intent.webUrl?.trim() || undefined;
  return {
    text,
    webUrl,
    files: intent.files?.map((f) => ({
      path: f.path,
      mimeType: f.mimeType,
      fileName: f.fileName,
    })),
    receivedAt: Date.now(),
  };
}

async function stabilizeShareFiles(files: IncomingShareFile[]): Promise<IncomingShareFile[]> {
  const stable: IncomingShareFile[] = [];
  for (const file of files) {
    if (!file.path?.trim()) continue;
    const name = file.fileName ?? `shared_${Date.now()}`;
    try {
      if (
        file.path.startsWith("content://")
        || file.path.startsWith("ph://")
        || !file.path.startsWith("file://")
      ) {
        const copied = await ensureUploadableFileUri(file.path, name);
        stable.push({ ...file, path: copied });
        continue;
      }
      const info = await FileSystem.getInfoAsync(file.path);
      if (info.exists) {
        stable.push(file);
        continue;
      }
      const copied = await ensureUploadableFileUri(file.path, name);
      stable.push({ ...file, path: copied });
    } catch {
      stable.push(file);
    }
  }
  return stable;
}

export async function stashIncomingShare(intent: ShareIntent): Promise<void> {
  const payload = shareIntentToPayload(intent);
  if (payload.files?.length) {
    payload.files = await stabilizeShareFiles(payload.files);
  }
  await AsyncStorage.setItem(KEY, JSON.stringify(payload));
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

export function payloadHasShareableContent(payload: IncomingSharePayload | null): boolean {
  if (!payload) return false;
  if (payload.text?.trim() || payload.webUrl?.trim()) return true;
  return Boolean(payload.files?.some((f) => f.path?.trim()));
}

export function payloadPreviewText(payload: IncomingSharePayload | null): string {
  if (!payload) return "";
  return combineTextParts(payload.text, payload.webUrl) ?? "";
}

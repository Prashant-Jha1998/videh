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

/** Remove duplicate lines/URLs (common in Google Pay / marketing shares). */
function dedupeShareText(text: string): string {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const key = line.replace(/\s+/g, " ").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  let result = out.join("\n");
  const urls = [...result.matchAll(/https?:\/\/[^\s]+/gi)].map((m) => m[0]);
  const uniqueUrls = [...new Set(urls)];
  if (uniqueUrls.length === 1 && urls.length > 1) {
    for (let i = 1; i < urls.length; i++) {
      result = result.replace(urls[i], "").trim();
    }
    result = result.replace(/\n{3,}/g, "\n\n").trim();
  }
  return result;
}

function isWhatsAppMediaPlaceholder(text?: string): boolean {
  const t = text?.trim() ?? "";
  if (!t) return false;
  return /^photo from .+$/i.test(t)
    || /^video from .+$/i.test(t)
    || /^document from .+$/i.test(t);
}

export function shareIntentToPayload(intent: ShareIntent): IncomingSharePayload {
  const rawText = combineTextParts(intent.text, intent.meta?.title);
  const text = rawText ? dedupeShareText(rawText) : undefined;
  const webUrlRaw = intent.webUrl?.trim() || undefined;
  const webUrl = webUrlRaw && text?.includes(webUrlRaw) ? undefined : webUrlRaw;
  return {
    text,
    webUrl,
    files: intent.files
      ?.map((f) => ({
        path: (f.path || (f as { contentUri?: string }).contentUri || "").trim(),
        mimeType: f.mimeType ?? undefined,
        fileName: f.fileName ?? undefined,
      }))
      .filter((f) => f.path),
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

export async function stashIncomingShare(
  intent: ShareIntent,
  options?: { copyFiles?: boolean },
): Promise<void> {
  const payload = shareIntentToPayload(intent);
  const shouldCopy = options?.copyFiles !== false;
  if (shouldCopy && payload.files?.length) {
    payload.files = await stabilizeShareFiles(payload.files);
    payload.files = payload.files.filter((f) => f.path?.trim());
  }
  await AsyncStorage.setItem(KEY, JSON.stringify(payload));
}

/** Store share immediately (copy files later on share-to-chat screen). */
export async function stashIncomingShareQuick(intent: ShareIntent): Promise<void> {
  await stashIncomingShare(intent, { copyFiles: false });
}

export async function hasPendingIncomingShare(): Promise<boolean> {
  const peek = await peekIncomingShare();
  return payloadHasShareableContent(peek);
}

/** Wait until ShareIntentBridge stashes payload (cold start can take a few seconds). */
export async function waitForPendingIncomingShare(maxMs = 20_000): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    if (await hasPendingIncomingShare()) return true;
    await new Promise((r) => setTimeout(r, 120));
  }
  return false;
}

export async function clearIncomingShare(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

/** Wait for ShareIntentBridge to finish stashing (cold start / GPay can be slow). */
export async function waitForIncomingShare(maxMs = 10_000): Promise<IncomingSharePayload | null> {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    const peek = await peekIncomingShare();
    if (peek && payloadHasShareableContent(peek)) return peek;
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

export async function ensureSharePayloadFiles(payload: IncomingSharePayload): Promise<IncomingSharePayload> {
  if (!payload.files?.length) return payload;
  const files = await stabilizeShareFiles(payload.files);
  return { ...payload, files: files.filter((f) => f.path?.trim()) };
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

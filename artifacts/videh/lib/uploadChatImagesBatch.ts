import { uploadChatMediaWithProgress } from "@/lib/chatMediaUpload";
import {
  imageExtFromUri,
  imageMimeFromUri,
  isGifUri,
  prepareImageForChatUpload,
  type MediaQuality,
} from "@/lib/imageEdit";

const UPLOAD_CONCURRENCY = 3;

export type BatchUploadProgress = {
  completed: number;
  total: number;
  currentPct: number;
};

export async function uploadChatImagesBatch(opts: {
  uris: string[];
  quality: MediaQuality;
  sessionToken?: string | null;
  signal?: AbortSignal;
  onProgress?: (p: BatchUploadProgress) => void;
}): Promise<string[]> {
  const { uris, quality, sessionToken, signal, onProgress } = opts;
  const total = uris.length;
  const results = new Array<string>(total);
  let completed = 0;
  let nextIndex = 0;

  const report = (filePct: number) => {
    const overall = total > 0
      ? Math.min(99, Math.round(((completed + filePct / 100) / total) * 100))
      : 0;
    onProgress?.({ completed, total, currentPct: overall });
  };

  async function processOne(index: number) {
    const raw = uris[index];
    report(0);
    const uri = isGifUri(raw) ? raw : await prepareImageForChatUpload(raw, quality);
    const mime = imageMimeFromUri(uri);
    const ext = imageExtFromUri(uri);
    const uploaded = await uploadChatMediaWithProgress({
      uri,
      mime,
      filename: `chat_${Date.now()}_${index}.${ext}`,
      sessionToken,
      signal,
      onProgress: (p) => report(p.percent),
    });
    results[index] = uploaded.url;
    completed += 1;
    report(100);
  }

  async function worker() {
    while (nextIndex < total) {
      if (signal?.aborted) throw new Error("Upload cancelled.");
      const index = nextIndex;
      nextIndex += 1;
      await processOne(index);
    }
  }

  const workers = Math.min(UPLOAD_CONCURRENCY, total);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  onProgress?.({ completed: total, total, currentPct: 100 });
  return results;
}

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

  const report = (currentPct: number) => {
    onProgress?.({ completed, total, currentPct });
  };

  async function uploadOne(index: number) {
    let uri = uris[index];
    if (!isGifUri(uri)) uri = await prepareImageForChatUpload(uri, quality);
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
      await uploadOne(index);
    }
  }

  const workers = Math.min(UPLOAD_CONCURRENCY, total);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

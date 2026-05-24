import { getApiUrl } from "./api";
import { ensureUploadableFileUri } from "./prepareFileUpload";

export type UploadProgress = {
  loaded: number;
  total: number;
  percent: number;
};

export type UploadChatMediaOptions = {
  uri: string;
  mime: string;
  filename: string;
  sessionToken?: string | null;
  onProgress?: (p: UploadProgress) => void;
  signal?: AbortSignal;
};

export function uploadChatMediaWithProgress(opts: UploadChatMediaOptions): Promise<{ url: string; mimeType: string; size: number }> {
  const { uri, mime, filename, sessionToken, onProgress, signal } = opts;
  const base = getApiUrl();

  return ensureUploadableFileUri(uri, filename).then((uploadUri) => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${base}/api/chats/media`);
    if (sessionToken) xhr.setRequestHeader("Authorization", `Bearer ${sessionToken}`);

    xhr.upload.onprogress = (ev) => {
      if (!ev.lengthComputable || !onProgress) return;
      onProgress({
        loaded: ev.loaded,
        total: ev.total,
        percent: Math.min(100, Math.round((ev.loaded / ev.total) * 100)),
      });
    };

    xhr.onload = () => {
      let data: { success?: boolean; url?: string; mimeType?: string; size?: number; message?: string } = {};
      try {
        data = JSON.parse(xhr.responseText) as typeof data;
      } catch {
        reject(new Error("Upload failed"));
        return;
      }
      if (xhr.status < 200 || xhr.status >= 300 || !data.success || !data.url) {
        reject(new Error(data.message ?? "Could not upload file."));
        return;
      }
      resolve({ url: data.url, mimeType: data.mimeType ?? mime, size: data.size ?? 0 });
    };

    xhr.onerror = () => reject(new Error("Network error during upload."));
    xhr.onabort = () => reject(new Error("Upload cancelled."));

    if (signal) {
      if (signal.aborted) {
        xhr.abort();
        return;
      }
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }

    const form = new FormData();
    form.append("file", { uri: uploadUri, name: filename, type: mime } as unknown as Blob);
    xhr.send(form);
  }));
}

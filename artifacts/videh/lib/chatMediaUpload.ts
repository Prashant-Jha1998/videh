import { Platform } from "react-native";
import { albumSendLog } from "@/lib/albumSendLog";
import { getApiUrl } from "./api";
import { ensureUploadableFileUri } from "./prepareFileUpload";
import { getWebFile } from "./web/webFileRegistry";

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
  logContext?: Record<string, unknown>;
};

export function uploadChatMediaWithProgress(opts: UploadChatMediaOptions): Promise<{ url: string; mimeType: string; size: number }> {
  const { uri, mime, filename, sessionToken, onProgress, signal, logContext } = opts;
  const base = getApiUrl();
  const started = Date.now();

  return ensureUploadableFileUri(uri, filename).then((uploadUri) => new Promise((resolve, reject) => {
    albumSendLog("upload_start", "xhr upload posting", { filename, ...logContext });
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
        albumSendLog("error", "xhr upload rejected", {
          status: xhr.status,
          message: data.message,
          elapsedMs: Date.now() - started,
          ...logContext,
        });
        reject(new Error(data.message ?? "Could not upload file."));
        return;
      }
      albumSendLog("upload_finish", "xhr upload ok", {
        status: xhr.status,
        url: data.url?.slice(0, 120),
        size: data.size ?? 0,
        elapsedMs: Date.now() - started,
        ...logContext,
      });
      resolve({ url: data.url, mimeType: data.mimeType ?? mime, size: data.size ?? 0 });
    };

    xhr.onerror = () => {
      albumSendLog("error", "xhr network error", { elapsedMs: Date.now() - started, ...logContext });
      reject(new Error("Network error during upload."));
    };
    xhr.onabort = () => {
      albumSendLog("cleanup", "xhr upload aborted", { elapsedMs: Date.now() - started, ...logContext });
      reject(new Error("Upload cancelled."));
    };

    if (signal) {
      if (signal.aborted) {
        xhr.abort();
        return;
      }
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }

    const form = new FormData();
    const webFile = Platform.OS === "web" ? getWebFile(uploadUri) : undefined;
    if (webFile) {
      form.append("file", webFile, filename);
    } else {
      form.append("file", { uri: uploadUri, name: filename, type: mime } as unknown as Blob);
    }
    xhr.send(form);
  }));
}

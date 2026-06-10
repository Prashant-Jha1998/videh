import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import { ensureUploadableFileUri } from "@/lib/prepareFileUpload";
import { getWebFile } from "@/lib/web/webFileRegistry";

export type PresignedUploadSlot = {
  uploadsRel: string;
  uploadUrl: string;
  publicUrl: string;
  contentType: string;
};

export async function putFileToPresignedUrl(opts: {
  presignedUrl: string;
  localUri: string;
  contentType: string;
  filename: string;
  onProgress?: (pct: number) => void;
}): Promise<void> {
  const { presignedUrl, contentType, onProgress } = opts;
  const uploadUri = await ensureUploadableFileUri(opts.localUri, opts.filename);

  if (Platform.OS === "web") {
    const webFile = getWebFile(uploadUri);
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", presignedUrl);
      xhr.setRequestHeader("Content-Type", contentType);
      xhr.upload.onprogress = (ev) => {
        if (!ev.lengthComputable || !onProgress) return;
        onProgress(Math.min(100, Math.round((ev.loaded / ev.total) * 100)));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`Upload failed (${xhr.status})`));
      };
      xhr.onerror = () => reject(new Error("Upload network error"));
      if (!webFile) {
        reject(new Error("Could not read file."));
        return;
      }
      xhr.send(webFile);
    });
    return;
  }

  const task = FileSystem.createUploadTask(
    presignedUrl,
    uploadUri,
    {
      httpMethod: "PUT",
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: { "Content-Type": contentType },
    },
    (data) => {
      if (!onProgress || !data.totalBytesExpectedToSend) return;
      onProgress(Math.min(100, Math.round((data.totalBytesSent / data.totalBytesExpectedToSend) * 100)));
    },
  );
  const result = await task.uploadAsync();
  if (!result || result.status < 200 || result.status >= 300) {
    throw new Error(`Upload failed (${result?.status ?? "unknown"})`);
  }
}

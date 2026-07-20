import { useEffect, useState } from "react";
import { resolveWebMediaFetchUrl } from "./webMediaUrl";

function inferMimeFromUrl(url: string): string | undefined {
  const path = url.split(/[?#]/)[0] ?? "";
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "m4a" || ext === "mp4") return "audio/mp4";
  if (ext === "mp3") return "audio/mpeg";
  if (ext === "aac") return "audio/aac";
  if (ext === "ogg" || ext === "oga") return "audio/ogg";
  if (ext === "wav") return "audio/wav";
  if (ext === "webm") return "audio/webm";
  return undefined;
}

function normalizeMediaBlob(blob: Blob, contentType: string | null, fetchUrl: string): Blob {
  const type = (contentType ?? "").split(";")[0]?.trim() ?? "";
  if (type.startsWith("audio/") || type.startsWith("video/") || type.startsWith("image/")) return blob;
  const inferred = inferMimeFromUrl(fetchUrl);
  if (!inferred) return blob;
  return new Blob([blob], { type: inferred });
}

/** Fetch protected chat media via web-session proxy and expose a blob URL. */
export function useAuthenticatedMediaUrl(url: string | undefined, token: string | null): {
  blobUrl: string | null;
  loading: boolean;
  failed: boolean;
} {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!url) {
      setBlobUrl(null);
      setLoading(false);
      setFailed(false);
      return;
    }
    const fetchUrl = token && (url.includes("/api/chats/media/") || url.includes("/api/statuses/media/"))
      ? resolveWebMediaFetchUrl(url, token)
      : url;

    if (
      !fetchUrl.includes("/api/web-session/")
      && !fetchUrl.includes("/api/chats/media/")
      && !fetchUrl.includes("/api/statuses/media/")
    ) {
      setBlobUrl(fetchUrl);
      setLoading(false);
      setFailed(false);
      return;
    }

    if (!token) {
      setBlobUrl(null);
      setLoading(false);
      setFailed(true);
      return;
    }

    let objectUrl: string | null = null;
    let cancelled = false;
    setLoading(true);
    setFailed(false);

    void fetch(fetchUrl, { credentials: "same-origin" })
      .then((res) => {
        if (!res.ok) throw new Error("Media fetch failed");
        const contentType = res.headers.get("content-type");
        return res.blob().then((blob) => normalizeMediaBlob(blob, contentType, fetchUrl));
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setFailed(true);
        setBlobUrl(null);
        setLoading(false);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, token]);

  return { blobUrl, loading, failed };
}

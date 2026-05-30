import { useEffect, useState } from "react";
import { resolveWebMediaFetchUrl } from "./webMediaUrl";

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
    const fetchUrl = token && url.includes("/api/chats/media/")
      ? resolveWebMediaFetchUrl(url, token)
      : url;

    if (!fetchUrl.includes("/api/web-session/") && !fetchUrl.includes("/api/chats/media/")) {
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
        return res.blob();
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

import { useEffect, useState } from "react";

/** Fetch protected chat media with auth and expose a blob URL for img/video tags. */
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
    if (!url.includes("/api/chats/media/") || !token) {
      setBlobUrl(url);
      setLoading(false);
      setFailed(false);
      return;
    }

    let objectUrl: string | null = null;
    let cancelled = false;
    setLoading(true);
    setFailed(false);

    void fetch(url, { headers: { Authorization: `Bearer ${token}` } })
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

import { useAuthenticatedMediaUrl } from "../../lib/authenticatedMedia";

export function WebChatImage({ url, token }: { url: string; token: string | null }) {
  const { blobUrl, loading, failed } = useAuthenticatedMediaUrl(url, token);
  if (failed) {
    return <div style={{ fontSize: 13, color: "#667781", marginBottom: 4 }}>Photo unavailable</div>;
  }
  if (loading || !blobUrl) {
    return <div style={{ fontSize: 13, color: "#667781", marginBottom: 4 }}>Loading photo…</div>;
  }
  return <img src={blobUrl} alt="" style={{ maxWidth: "100%", borderRadius: 8, marginBottom: 4 }} />;
}

export function WebChatVideo({ url, token }: { url: string; token: string | null }) {
  const { blobUrl, loading, failed } = useAuthenticatedMediaUrl(url, token);
  if (failed) {
    return <div style={{ fontSize: 13, color: "#667781", marginBottom: 4 }}>Video unavailable</div>;
  }
  if (loading || !blobUrl) {
    return <div style={{ fontSize: 13, color: "#667781", marginBottom: 4 }}>Loading video…</div>;
  }
  return (
    <video
      src={blobUrl}
      controls
      playsInline
      style={{ maxWidth: "100%", maxHeight: 280, borderRadius: 8, marginBottom: 4, backgroundColor: "#000" }}
    />
  );
}

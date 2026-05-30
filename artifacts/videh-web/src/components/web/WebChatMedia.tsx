import { useAuthenticatedMediaUrl } from "../../lib/authenticatedMedia";

function openBlob(blobUrl: string, filename?: string) {
  const w = window.open(blobUrl, "_blank", "noopener,noreferrer");
  if (!w && filename) {
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    a.target = "_blank";
    a.rel = "noopener";
    a.click();
  }
}

export function WebChatImage({ url, token }: { url: string; token: string | null }) {
  const { blobUrl, loading, failed } = useAuthenticatedMediaUrl(url, token);
  if (failed) {
    return <div style={{ fontSize: 13, color: "#667781", marginBottom: 4 }}>Photo unavailable</div>;
  }
  if (loading || !blobUrl) {
    return <div style={{ fontSize: 13, color: "#667781", marginBottom: 4 }}>Loading photo…</div>;
  }
  return (
    <img
      src={blobUrl}
      alt=""
      role="button"
      tabIndex={0}
      onClick={() => openBlob(blobUrl)}
      onKeyDown={(e) => {
        if (e.key === "Enter") openBlob(blobUrl);
      }}
      style={{ maxWidth: "100%", maxHeight: 360, borderRadius: 8, marginBottom: 4, cursor: "pointer" }}
    />
  );
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

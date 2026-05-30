import { useAuthenticatedMediaUrl } from "../../lib/authenticatedMedia";

function docBadge(filename: string): { label: string; bg: string; color: string } {
  const ext = (filename.split(".").pop() ?? "file").toLowerCase();
  if (ext === "pdf") return { label: "PDF", bg: "#FFEBEE", color: "#E53935" };
  if (ext === "doc" || ext === "docx") return { label: "DOC", bg: "#E3F2FD", color: "#1565C0" };
  if (ext === "xls" || ext === "xlsx" || ext === "csv") return { label: ext.toUpperCase(), bg: "#E8F5E9", color: "#2E7D32" };
  return { label: ext.toUpperCase().slice(0, 4) || "FILE", bg: "#E7F6F1", color: "#00A884" };
}

export function WebDocumentBubble({
  url,
  token,
  filename,
}: {
  url: string;
  token: string | null;
  filename: string;
}) {
  const { blobUrl, loading, failed } = useAuthenticatedMediaUrl(url, token);
  const badge = docBadge(filename);

  const openDoc = () => {
    if (!blobUrl) return;
    const w = window.open(blobUrl, "_blank", "noopener,noreferrer");
    if (!w) {
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename || "document";
      a.target = "_blank";
      a.rel = "noopener";
      a.click();
    }
  };

  const isPdf = filename.toLowerCase().endsWith(".pdf");

  return (
    <div style={{ minWidth: 240, maxWidth: 320 }}>
      {isPdf && blobUrl ? (
        <iframe
          title="PDF preview"
          src={blobUrl}
          style={{
            width: "100%",
            height: 140,
            border: "none",
            borderRadius: "8px 8px 0 0",
            backgroundColor: "#f0f2f5",
            marginBottom: 4,
          }}
        />
      ) : null}
      <button
        type="button"
        onClick={openDoc}
        disabled={loading || failed || !blobUrl}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          width: "100%",
          padding: "10px 12px",
          border: "none",
          borderRadius: 8,
          backgroundColor: "rgba(0,0,0,0.04)",
          cursor: blobUrl ? "pointer" : "wait",
          textAlign: "left",
        }}
      >
        <div
          style={{
            width: 42,
            height: 48,
            borderRadius: 4,
            backgroundColor: badge.bg,
            color: badge.color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: 11,
            flexShrink: 0,
          }}
        >
          {badge.label}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: "#111b21",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {filename || "Document"}
          </div>
          <div style={{ fontSize: 12, color: failed ? "#ea0038" : "#667781", marginTop: 2 }}>
            {failed ? "Could not load file" : loading ? "Loading…" : "Click to open"}
          </div>
        </div>
      </button>
    </div>
  );
}

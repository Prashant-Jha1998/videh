import { useAuthenticatedMediaUrl } from "../../lib/authenticatedMedia";
import { documentFilenameFromContent } from "../../lib/documentMessage";
import { highlightMatches } from "../../lib/highlightText";

function docBadge(filename: string): { label: string; bg: string; color: string } {
  const ext = (filename.split(".").pop() ?? "file").toLowerCase();
  if (ext === "pdf") return { label: "PDF", bg: "#FFEBEE", color: "#E53935" };
  if (ext === "doc" || ext === "docx") return { label: "DOC", bg: "#E3F2FD", color: "#1565C0" };
  if (ext === "xls" || ext === "xlsx" || ext === "csv") return { label: ext.toUpperCase(), bg: "#E8F5E9", color: "#2E7D32" };
  return { label: ext.toUpperCase().slice(0, 4) || "FILE", bg: "#E8E6FF", color: "#5B4FE8" };
}

export function WebDocumentBubble({
  url,
  token,
  content,
  highlightQuery,
}: {
  url: string;
  token: string | null;
  content: string;
  highlightQuery?: string;
}) {
  const filename = documentFilenameFromContent(content);
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
  const canOpen = Boolean(blobUrl) && !failed;

  return (
    <button
      type="button"
      onClick={openDoc}
      disabled={!canOpen}
      title={canOpen ? "Open document" : loading ? "Loading document…" : "Could not load document"}
      style={{
        display: "block",
        width: "100%",
        minWidth: 240,
        maxWidth: 320,
        padding: 0,
        margin: 0,
        border: "none",
        borderRadius: 8,
        background: "transparent",
        cursor: canOpen ? "pointer" : loading ? "wait" : "default",
        textAlign: "left",
        overflow: "hidden",
      }}
    >
      {isPdf && blobUrl ? (
        <div
          style={{
            position: "relative",
            width: "100%",
            height: 140,
            marginBottom: 2,
            borderRadius: "8px 8px 0 0",
            overflow: "hidden",
            backgroundColor: "#f0f2f5",
          }}
        >
          <iframe
            title="PDF preview"
            src={`${blobUrl}#page=1&toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
            style={{
              width: "100%",
              height: "100%",
              border: "none",
              pointerEvents: "none",
            }}
          />
          {canOpen ? (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "transparent",
              }}
              aria-hidden
            />
          ) : null}
        </div>
      ) : null}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          width: "100%",
          padding: "10px 12px",
          borderRadius: isPdf && blobUrl ? "0 0 8px 8px" : 8,
          backgroundColor: "rgba(0,0,0,0.04)",
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
              color: "#14131F",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {highlightQuery?.trim()
              ? highlightMatches(filename || "Document", highlightQuery)
              : filename || "Document"}
          </div>
          <div style={{ fontSize: 12, color: failed ? "#ea0038" : "#667781", marginTop: 2 }}>
            {failed ? "Could not load file" : loading ? "Loading…" : "Tap to open"}
          </div>
        </div>
      </div>
    </button>
  );
}

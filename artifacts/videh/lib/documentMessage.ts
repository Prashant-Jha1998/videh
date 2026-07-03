import type { ComponentProps } from "react";
import type { Ionicons } from "@expo/vector-icons";

const DOC_PAYLOAD_PREFIX = "\u2063doc:";

export type DocumentMessagePayload = {
  filename: string;
  caption?: string;
  pages?: number;
};

export function encodeDocumentMessagePayload(payload: DocumentMessagePayload): string {
  return DOC_PAYLOAD_PREFIX + JSON.stringify(payload);
}

export function parseDocumentMessagePayload(text: string): DocumentMessagePayload & { legacy: boolean } {
  if (!text.startsWith(DOC_PAYLOAD_PREFIX)) {
    return { filename: text || "Document", legacy: true };
  }
  try {
    const raw = JSON.parse(text.slice(DOC_PAYLOAD_PREFIX.length)) as DocumentMessagePayload;
    return {
      filename: raw.filename || "Document",
      caption: raw.caption?.trim() || undefined,
      pages: typeof raw.pages === "number" && raw.pages > 0 ? raw.pages : undefined,
      legacy: false,
    };
  } catch {
    return { filename: text || "Document", legacy: true };
  }
}

export function isDocumentMessagePayload(text: string): boolean {
  return (text ?? "").trim().startsWith(DOC_PAYLOAD_PREFIX);
}

export function documentFilenameFromText(text: string): string {
  return parseDocumentMessagePayload(text).filename;
}

/** Chat list / notification preview for document messages (never show raw JSON). */
export function documentChatPreview(text: string): string {
  const parsed = parseDocumentMessagePayload(text);
  if (parsed.caption?.trim()) return parsed.caption.trim();
  const name = parsed.filename?.trim();
  if (name && name !== "Document") return `📄 ${name}`;
  return "📄 Document";
}

export function documentCaptionFromText(text: string): string | undefined {
  return parseDocumentMessagePayload(text).caption;
}

export function documentPagesFromText(text: string): number | undefined {
  return parseDocumentMessagePayload(text).pages;
}

export function formatFileSize(bytes?: number | null): string {
  if (bytes == null || bytes < 1) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type DocumentVisual = {
  icon: ComponentProps<typeof Ionicons>["name"];
  badge: string;
  iconColor: string;
  iconBg: string;
};

export function getDocumentVisual(filename: string): DocumentVisual {
  const ext = (filename.split(".").pop() ?? "").toLowerCase();
  switch (ext) {
    case "pdf":
      return { icon: "document-text", badge: "PDF", iconColor: "#E53935", iconBg: "#FFEBEE" };
    case "doc":
    case "docx":
      return { icon: "document-text", badge: "DOC", iconColor: "#1565C0", iconBg: "#E3F2FD" };
    case "xls":
    case "xlsx":
    case "csv":
      return { icon: "grid", badge: ext.toUpperCase(), iconColor: "#2E7D32", iconBg: "#E8F5E9" };
    case "ppt":
    case "pptx":
      return { icon: "easel", badge: "PPT", iconColor: "#E65100", iconBg: "#FFF3E0" };
    case "zip":
    case "rar":
    case "7z":
      return { icon: "archive", badge: ext.toUpperCase(), iconColor: "#6D4C41", iconBg: "#EFEBE9" };
    case "txt":
      return { icon: "document-text-outline", badge: "TXT", iconColor: "#546E7A", iconBg: "#ECEFF1" };
    case "mp3":
    case "m4a":
    case "wav":
    case "aac":
      return { icon: "musical-notes", badge: ext.toUpperCase(), iconColor: "#7B1FA2", iconBg: "#F3E5F5" };
    default:
      return { icon: "document", badge: ext ? ext.toUpperCase().slice(0, 4) : "FILE", iconColor: "#059669", iconBg: "#E8E6FF" };
  }
}

export function documentMetaLine(fileSizeBytes?: number | null): string {
  const size = formatFileSize(fileSizeBytes);
  return size ? `${size} · Document · Tap to open` : "Document · Tap to open";
}

/** Rich document meta: `52 pages • 28 MB • PDF` */
export function richDocumentMetaLine(
  filename: string,
  fileSizeBytes?: number | null,
  pageCount?: number | null,
): string {
  const ext = (filename.split(".").pop() ?? "FILE").toUpperCase();
  const size = formatFileSize(fileSizeBytes);
  const pages =
    pageCount != null && pageCount > 0
      ? `${pageCount} page${pageCount === 1 ? "" : "s"}`
      : "";
  const parts = [pages, size, ext].filter(Boolean);
  return parts.join(" • ");
}

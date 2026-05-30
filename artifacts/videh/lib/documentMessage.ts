import type { ComponentProps } from "react";
import type { Ionicons } from "@expo/vector-icons";

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
      return { icon: "document", badge: ext ? ext.toUpperCase().slice(0, 4) : "FILE", iconColor: "#00A884", iconBg: "#E7F6F1" };
  }
}

export function documentMetaLine(fileSizeBytes?: number | null): string {
  const size = formatFileSize(fileSizeBytes);
  return size ? `${size} · Document · Tap to open` : "Document · Tap to open";
}

/** WhatsApp Web: `CSV • 3 MB` */
export function whatsappDocumentMetaLine(filename: string, fileSizeBytes?: number | null): string {
  const ext = (filename.split(".").pop() ?? "FILE").toUpperCase();
  const size = formatFileSize(fileSizeBytes);
  return size ? `${ext} • ${size}` : ext;
}

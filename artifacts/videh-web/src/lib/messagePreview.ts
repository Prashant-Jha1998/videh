export function inferListPreview(
  type: string | undefined,
  content: string,
  isDeleted?: boolean,
): string {
  if (isDeleted) return "This message was deleted";
  const t = (type ?? "text").toLowerCase();
  const text = (content ?? "").trim();
  if (t === "image") return text && text !== "Attachment" && text !== "📷 Photo" ? text : "Photo";
  if (t === "video") return text && text !== "🎥 Video" ? text : "Video";
  if (t === "document") return text ? `📄 ${text}` : "Document";
  if (t === "audio" || t === "voice") return "Voice message";
  if (t === "call") return text || "Call";
  if (t === "location") return "Location";
  if (t === "contact") return "Contact";
  return text || "Message";
}

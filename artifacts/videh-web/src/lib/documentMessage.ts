const DOC_PAYLOAD_PREFIX = "\u2063doc:";

export function isDocumentMessagePayload(text: string): boolean {
  const raw = (text ?? "").trim();
  return raw.startsWith(DOC_PAYLOAD_PREFIX) || /^doc:\s*\{/i.test(raw);
}

export function documentFilenameFromContent(text: string): string {
  const raw = (text ?? "").trim();
  let jsonPart = "";
  if (raw.startsWith(DOC_PAYLOAD_PREFIX)) {
    jsonPart = raw.slice(DOC_PAYLOAD_PREFIX.length);
  } else if (/^doc:\s*\{/i.test(raw)) {
    jsonPart = raw.replace(/^doc:\s*/i, "");
  } else {
    return raw || "Document";
  }
  try {
    const parsed = JSON.parse(jsonPart) as { filename?: string };
    return parsed.filename?.trim() || "Document";
  } catch {
    return "Document";
  }
}

export function isDocumentMessage(msg: {
  type?: string;
  content?: string;
  media_url?: string | null;
}): boolean {
  if (!msg.media_url) return false;
  if ((msg.type ?? "").toLowerCase() === "document") return true;
  return isDocumentMessagePayload(msg.content ?? "");
}

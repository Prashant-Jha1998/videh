/** WhatsApp Web–style: download media to disk instead of phone gallery. */
export async function downloadUrlToDevice(
  url: string,
  filename: string,
  fetchHeaders?: Record<string, string>,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (typeof document === "undefined") {
    return { ok: false, message: "Download is not available here." };
  }
  try {
    let blobUrl = url;
    if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("/")) {
      const res = await fetch(url, { headers: fetchHeaders });
      if (!res.ok) return { ok: false, message: "Could not download this file." };
      const blob = await res.blob();
      blobUrl = URL.createObjectURL(blob);
    }
    const anchor = document.createElement("a");
    anchor.href = blobUrl;
    anchor.download = filename.replace(/[^\w.\-() ]+/g, "_") || "download";
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    if (blobUrl.startsWith("blob:") && blobUrl !== url) {
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
    }
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, message: e instanceof Error ? e.message : "Download failed." };
  }
}

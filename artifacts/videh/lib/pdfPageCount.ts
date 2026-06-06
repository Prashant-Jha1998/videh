import * as FileSystem from "expo-file-system/legacy";

/** Best-effort PDF page count without native PDF libs. */
export async function estimatePdfPageCount(uri: string): Promise<number | undefined> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    const bytes = info.exists && "size" in info ? (info.size ?? 0) : 0;
    const readLen = Math.min(Math.max(bytes, 4096), 900_000);
    const b64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
      length: readLen,
    });
    const ascii = decodeBase64Ascii(b64);
    const countMatch = ascii.match(/\/Type\s*\/Pages[^]*?\/Count\s+(\d+)/);
    if (countMatch) {
      const n = Number(countMatch[1]);
      if (Number.isFinite(n) && n > 0) return n;
    }
    const pageHits = ascii.match(/\/Type\s*\/Page\b(?!s)/g);
    if (pageHits && pageHits.length > 0) return pageHits.length;
  } catch {
    /* ignore */
  }
  return undefined;
}

function decodeBase64Ascii(b64: string): string {
  try {
    if (typeof atob === "function") return atob(b64);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return Buffer.from(b64, "base64").toString("latin1");
  } catch {
    return "";
  }
}

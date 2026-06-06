/** Fallback when platform-specific preview is unavailable. */
export function PdfPagePreview(_props: {
  mediaUrl: string;
  filename: string;
  sessionToken?: string | null;
  height?: number;
  localUri?: string | null;
}) {
  return null;
}

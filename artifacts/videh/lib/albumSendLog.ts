type AlbumSendPhase =
  | "upload_start"
  | "upload_finish"
  | "message_create"
  | "db_write"
  | "render"
  | "cleanup"
  | "merge"
  | "error";

export function albumSendLog(
  phase: AlbumSendPhase,
  message: string,
  data?: Record<string, unknown>,
): void {
  const payload = { phase, ...data, ts: Date.now() };
  if (__DEV__) {
    console.warn(`[AlbumSend:${phase}] ${message}`, payload);
  } else {
    console.log(`[AlbumSend:${phase}] ${message}`, JSON.stringify(payload));
  }
}

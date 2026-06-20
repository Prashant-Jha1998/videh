/** Deterministic RFC-4122 UUID (v4-shaped) from Videh callId — CallKit requires valid UUIDs. */
export function callIdToCallKeepUuid(callId: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < callId.length; i++) {
    const c = callId.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
  }
  const p = [
    (h1 >>> 0).toString(16).padStart(8, "0"),
    (h2 >>> 0).toString(16).padStart(8, "0"),
    (Math.imul(h1, h2) >>> 0).toString(16).padStart(8, "0"),
    (Math.imul(h2, h1) >>> 0).toString(16).padStart(8, "0"),
  ].join("");
  return `${p.slice(0, 8)}-${p.slice(8, 12)}-4${p.slice(13, 16)}-a${p.slice(17, 20)}-${p.slice(20, 32)}`;
}

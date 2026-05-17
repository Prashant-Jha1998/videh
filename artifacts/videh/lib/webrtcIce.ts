/** Shared STUN servers for Videh self-hosted WebRTC calls. */
export const VIDEH_ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
];

export function peerChannel(baseChannel: string, localUserId: number, remoteUserId: number): string {
  if (!remoteUserId || localUserId === remoteUserId) return baseChannel;
  const a = Math.min(localUserId, remoteUserId);
  const b = Math.max(localUserId, remoteUserId);
  return `${baseChannel}_peer_${a}_${b}`;
}

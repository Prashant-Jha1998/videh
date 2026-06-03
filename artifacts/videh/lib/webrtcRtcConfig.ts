import { loadIceServers } from "@/lib/webrtcIce";

export type RtcConfiguration = {
  iceServers: RTCIceServer[];
  iceCandidatePoolSize?: number;
  bundlePolicy?: RTCBundlePolicy;
  rtcpMuxPolicy?: RTCRtcpMuxPolicy;
};

/** Shared RTCPeerConnection config — tuned for mobile group mesh stability. */
export async function buildRtcConfiguration(
  sessionToken?: string | null,
  peerCount = 1,
): Promise<RtcConfiguration> {
  const iceServers = await loadIceServers(sessionToken);
  return {
    iceServers,
    iceCandidatePoolSize: peerCount > 4 ? 4 : 2,
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
  };
}

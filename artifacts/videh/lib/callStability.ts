/** Stability tuning for Videh calls (1:1 + mesh group conferences). */

/** Max people in one conference (including host). */
export const MAX_CALL_PARTICIPANTS = 32;

/** Connect mesh peers in small batches to avoid CPU/radio spikes on mobile. */
export const MESH_PEER_CONNECT_STAGGER_MS = 400;
export const MESH_PEER_CONNECT_BATCH_SIZE = 2;

/** Status poll while in call — faster when conference grows. */
export const CALL_STATUS_POLL_MS = 2000;
export const CALL_STATUS_POLL_MS_CONFERENCE = 1000;

/** Signaling poll per peer connection. */
export const SIGNAL_POLL_MS = 250;

/** Auto lower video quality when many participants (saves bandwidth). */
export const GROUP_VIDEO_DEGRADE_AT = 5;
export const GROUP_VIDEO_OFF_AT = 8;

/** Wait before ICE restart on transient disconnect. */
export const ICE_RESTART_AFTER_MS = 2000;

export function statusPollIntervalMs(participantCount: number): number {
  return participantCount > 3 ? CALL_STATUS_POLL_MS_CONFERENCE : CALL_STATUS_POLL_MS;
}

export function effectiveCallVideo(
  requestedVideo: boolean,
  acceptedParticipantCount: number,
): boolean {
  if (!requestedVideo) return false;
  if (acceptedParticipantCount >= GROUP_VIDEO_OFF_AT) return false;
  return true;
}

export function isConferenceCall(participantCount: number): boolean {
  return participantCount > 2;
}

import type { CallUiPhase } from "@/lib/callState";

export type RemoteCallPeerStream = {
  peerId: number;
  streamUrl?: string;
  hasVideo: boolean;
};

export interface VidehCallState {
  joined: boolean;
  connectionPhase: CallUiPhase;
  error: string | null;
  muted: boolean;
  cameraOff: boolean;
  speakerOn: boolean;
  remoteCount: number;
  localVideoId: string;
  remoteVideoId: string;
  localStreamUrl?: string;
  remoteStreamUrl?: string;
  hasRemoteVideo: boolean;
  remoteUid: number | null;
  remotePeers: RemoteCallPeerStream[];
  toggleMute: () => void;
  toggleCamera: () => void;
  toggleSpeaker: () => void;
  setSpeaker: (enabled: boolean) => void;
  setHeld: (held: boolean) => void;
  shareScreen: () => Promise<boolean>;
  stopScreenShare: () => Promise<void>;
  leave: () => Promise<void>;
}

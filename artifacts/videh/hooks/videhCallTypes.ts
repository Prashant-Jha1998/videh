export interface VidehCallState {
  joined: boolean;
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
  toggleMute: () => void;
  toggleCamera: () => void;
  toggleSpeaker: () => void;
  leave: () => Promise<void>;
}

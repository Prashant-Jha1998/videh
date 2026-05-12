import { useEffect, useState } from "react";
import { PermissionsAndroid, Platform } from "react-native";

export interface VidehCallState {
  joined: boolean;
  error: string | null;
  muted: boolean;
  cameraOff: boolean;
  speakerOn: boolean;
  remoteCount: number;
  localVideoId: string;
  remoteVideoId: string;
  hasRemoteVideo: boolean;
  remoteUid: number | null;
  toggleMute: () => void;
  toggleCamera: () => void;
  toggleSpeaker: () => void;
  leave: () => Promise<void>;
}

export function useVidehCall(_channel: string, _uid: number, isVideo: boolean): VidehCallState {
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const requestPermissions = async () => {
      if (Platform.OS !== "android") {
        setError("SELF_HOSTED_WEBRTC_NATIVE_REQUIRED");
        return;
      }
      const perms: string[] = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
      if (isVideo) perms.push(PermissionsAndroid.PERMISSIONS.CAMERA);
      const results = await PermissionsAndroid.requestMultiple(perms as any);
      const denied = Object.values(results).some((v) => v !== PermissionsAndroid.RESULTS.GRANTED);
      setError(denied ? "Microphone/camera permission denied" : "SELF_HOSTED_WEBRTC_NATIVE_REQUIRED");
    };
    requestPermissions().catch(() => setError("Microphone/camera permission denied"));
  }, [isVideo]);

  return {
    joined: false,
    error,
    muted,
    cameraOff,
    speakerOn,
    remoteCount: 0,
    localVideoId: "",
    remoteVideoId: "",
    hasRemoteVideo: false,
    remoteUid: null,
    toggleMute: () => setMuted((m) => !m),
    toggleCamera: () => setCameraOff((c) => !c),
    toggleSpeaker: () => setSpeakerOn((s) => !s),
    leave: async () => {},
  };
}

import { useEffect, useRef, useState } from "react";
import { PermissionsAndroid, Platform } from "react-native";
import { getApiUrl } from "@/lib/api";

const ENV_APP_ID = process.env.EXPO_PUBLIC_AGORA_APP_ID ?? "";

export interface AgoraCallState {
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
  engineRef: React.MutableRefObject<any>;
}

export function useAgoraCall(channel: string, uid: number, isVideo: boolean): AgoraCallState {
  const engineRef = useRef<any>(null);
  const [joined, setJoined] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(false);
  const [remoteCount, setRemoteCount] = useState(0);
  const [remoteUid, setRemoteUid] = useState<number | null>(null);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        let appId = ENV_APP_ID;
        if (!appId) {
          const baseUrl = getApiUrl();
          const res = await fetch(`${baseUrl}/api/agora/config`);
          const data = await res.json() as { success?: boolean; appId?: string };
          if (data.success && data.appId) {
            appId = data.appId;
          }
        }
        if (!appId) {
          setError("Agora App ID not configured");
          return;
        }
        let rtcToken: string | null = null;
        try {
          const baseUrl = getApiUrl();
          const tokenRes = await fetch(`${baseUrl}/api/agora/token?channel=${encodeURIComponent(channel)}&uid=${uid}`);
          const tokenData = await tokenRes.json() as { success?: boolean; token?: string | null };
          if (tokenData.success) rtcToken = tokenData.token ?? null;
        } catch {}

        if (Platform.OS === "android") {
          const perms: string[] = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
          if (isVideo) perms.push(PermissionsAndroid.PERMISSIONS.CAMERA);
          const results = await PermissionsAndroid.requestMultiple(perms as any);
          const denied = Object.values(results).some((v) => v !== PermissionsAndroid.RESULTS.GRANTED);
          if (denied) { setError("Microphone/camera permission denied"); return; }
        }

        const {
          createAgoraRtcEngine,
          ChannelProfileType,
          ClientRoleType,
          RenderModeType,
          VideoSourceType,
        } = require("react-native-agora");

        const engine = createAgoraRtcEngine();
        engineRef.current = engine;

        engine.registerEventHandler({
          onJoinChannelSuccess: (_connection: any, _elapsed: number) => {
            setJoined(true);
            engine.setEnableSpeakerphone(true);
          },
          onUserJoined: (_connection: any, remoteUid: number) => {
            setRemoteUid(remoteUid);
            setRemoteCount((c) => c + 1);
            if (isVideo) setHasRemoteVideo(true);
          },
          onUserOffline: (_connection: any, _remoteUid: number) => {
            setRemoteUid(null);
            setRemoteCount((c) => Math.max(0, c - 1));
            setHasRemoteVideo(false);
          },
          onError: (err: number, msg: string) => setError(`Error ${err}: ${msg}`),
        });

        engine.initialize({
          appId,
          channelProfile: ChannelProfileType.ChannelProfileCommunication,
        });

        engine.enableAudio();
        if (isVideo) engine.enableVideo();

        engine.joinChannel(rtcToken, channel, uid, {
          clientRoleType: ClientRoleType.ClientRoleBroadcaster,
          publishMicrophoneTrack: true,
          publishCameraTrack: isVideo,
        });
      } catch (e: any) {
        const msg: string = e?.message ?? "";
        if (
          msg.includes("native module") ||
          msg.includes("TurboModuleRegistry") ||
          msg.includes("NativeModules") ||
          msg.includes("Cannot read property") ||
          msg.includes("null is not an object")
        ) {
          setError("EXPO_GO");
        } else {
          if (msg.includes("110")) {
            setError("Error 110: Call authentication failed. Check Agora token/App Certificate setup.");
          } else {
            setError(msg || "Failed to start call");
          }
        }
      }
    };

    init();

    return () => {
      if (engineRef.current) {
        engineRef.current.leaveChannel();
        engineRef.current.release();
        engineRef.current = null;
      }
    };
  }, [channel]);

  const toggleMute = () => {
    engineRef.current?.muteLocalAudioStream(!muted);
    setMuted((m) => !m);
  };

  const toggleCamera = () => {
    engineRef.current?.muteLocalVideoStream(!cameraOff);
    setCameraOff((c) => !c);
  };

  const toggleSpeaker = () => {
    engineRef.current?.setEnableSpeakerphone(!speakerOn);
    setSpeakerOn((s) => !s);
  };

  const leave = async () => {
    engineRef.current?.leaveChannel();
    engineRef.current?.release();
    engineRef.current = null;
  };

  return {
    joined,
    error,
    muted,
    cameraOff,
    speakerOn,
    remoteCount,
    localVideoId: "",
    remoteVideoId: "",
    hasRemoteVideo,
    remoteUid,
    toggleMute,
    toggleCamera,
    toggleSpeaker,
    leave,
    engineRef,
  };
}

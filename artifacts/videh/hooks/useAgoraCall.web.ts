import { useEffect, useRef, useState } from "react";
import AgoraRTC, {
  type IAgoraRTCClient,
  type ICameraVideoTrack,
  type IMicrophoneAudioTrack,
  type IRemoteVideoTrack,
} from "agora-rtc-sdk-ng";
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
  toggleMute: () => void;
  toggleCamera: () => void;
  toggleSpeaker: () => void;
  leave: () => Promise<void>;
}

export function useAgoraCall(channel: string, uid: number, isVideo: boolean): AgoraCallState {
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const audioRef = useRef<IMicrophoneAudioTrack | null>(null);
  const videoRef = useRef<ICameraVideoTrack | null>(null);
  const remoteVideoRef = useRef<IRemoteVideoTrack | null>(null);

  const [joined, setJoined] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(false);
  const [remoteCount, setRemoteCount] = useState(0);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const localVideoId = `agora-local-${channel}`;
  const remoteVideoId = `agora-remote-${channel}`;

  useEffect(() => {
    const connect = async () => {
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

        const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
        clientRef.current = client;

        client.on("user-published", async (user, mediaType) => {
          await client.subscribe(user, mediaType);
          if (mediaType === "video") {
            remoteVideoRef.current = user.videoTrack ?? null;
            setHasRemoteVideo(true);
            setTimeout(() => user.videoTrack?.play(remoteVideoId), 100);
          }
          if (mediaType === "audio") {
            user.audioTrack?.play();
          }
          setRemoteCount(client.remoteUsers.length);
        });

        client.on("user-unpublished", (_user, mediaType) => {
          if (mediaType === "video") { remoteVideoRef.current = null; setHasRemoteVideo(false); }
          setRemoteCount(client.remoteUsers.length);
        });

        client.on("user-left", () => setRemoteCount(client.remoteUsers.length));

        await client.join(appId, channel, null, uid);
        const audio = await AgoraRTC.createMicrophoneAudioTrack();
        audioRef.current = audio;
        const toPublish: any[] = [audio];
        if (isVideo) {
          const video = await AgoraRTC.createCameraVideoTrack();
          videoRef.current = video;
          toPublish.push(video);
          setTimeout(() => video.play(localVideoId), 100);
        }
        await client.publish(toPublish);
        setJoined(true);
      } catch (e: any) {
        setError(e.message ?? "Failed to join call");
      }
    };

    connect();

    return () => {
      audioRef.current?.close();
      videoRef.current?.close();
      client.leave().catch(() => {});
    };
  }, [channel]);

  const toggleMute = async () => {
    if (!audioRef.current) return;
    await audioRef.current.setMuted(!muted);
    setMuted((m) => !m);
  };

  const toggleCamera = async () => {
    if (!videoRef.current) return;
    await videoRef.current.setMuted(!cameraOff);
    setCameraOff((c) => !c);
  };

  const toggleSpeaker = () => setSpeakerOn((s) => !s);

  const leave = async () => {
    audioRef.current?.close();
    videoRef.current?.close();
    await clientRef.current?.leave();
  };

  return { joined, error, muted, cameraOff, speakerOn, remoteCount, localVideoId, remoteVideoId, hasRemoteVideo, toggleMute, toggleCamera, toggleSpeaker, leave };
}

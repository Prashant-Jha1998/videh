import { useEffect, useRef, useState } from "react";
import { PermissionsAndroid, Platform } from "react-native";
import { getApiUrl } from "@/lib/api";

type Role = "caller" | "callee";

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

export function useVidehCall(channel: string, uid: number, isVideo: boolean): VidehCallState {
  const pcRef = useRef<any>(null);
  const localStreamRef = useRef<any>(null);
  const roleRef = useRef<Role>("caller");
  const candidateCursorRef = useRef(0);
  const [joined, setJoined] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [remoteCount, setRemoteCount] = useState(0);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [localStreamUrl, setLocalStreamUrl] = useState<string | undefined>();
  const [remoteStreamUrl, setRemoteStreamUrl] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const localVideoId = `videh-local-${channel}`;
  const remoteVideoId = `videh-remote-${channel}`;

  useEffect(() => {
    if (!channel) return;
    if (Platform.OS !== "web") {
      let stopped = false;
      let pollTimer: ReturnType<typeof setInterval> | null = null;
      const baseUrl = getApiUrl();

      const postJson = async (path: string, body: unknown) => {
        await fetch(`${baseUrl}/api/webrtc${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      };

      const connectNative = async () => {
        try {
          if (Platform.OS === "android") {
            const perms: string[] = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
            if (isVideo) perms.push(PermissionsAndroid.PERMISSIONS.CAMERA);
            const results = await PermissionsAndroid.requestMultiple(perms as any);
            const denied = Object.values(results).some((v) => v !== PermissionsAndroid.RESULTS.GRANTED);
            if (denied) {
              setError("Microphone/camera permission denied");
              return;
            }
          }

          const {
            RTCPeerConnection,
            RTCSessionDescription,
            RTCIceCandidate,
            mediaDevices,
          } = require("react-native-webrtc");

          const sessionRes = await fetch(`${baseUrl}/api/webrtc/sessions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ channel, userId: uid, type: isVideo ? "video" : "audio" }),
          });
          const sessionData = await sessionRes.json() as { success?: boolean; role?: Role };
          if (!sessionData.success || !sessionData.role) throw new Error("Could not start call signaling.");
          roleRef.current = sessionData.role;

          const localStream = await mediaDevices.getUserMedia({ audio: true, video: isVideo });
          localStreamRef.current = localStream;
          setLocalStreamUrl(typeof localStream.toURL === "function" ? localStream.toURL() : undefined);

          const pc = new RTCPeerConnection({ iceServers: [] });
          pcRef.current = pc;
          localStream.getTracks().forEach((track: any) => pc.addTrack(track, localStream));
          pc.onicecandidate = (event: any) => {
            if (event.candidate) {
              const candidate = typeof event.candidate.toJSON === "function" ? event.candidate.toJSON() : event.candidate;
              void postJson(`/sessions/${encodeURIComponent(channel)}/candidates`, { role: roleRef.current, candidate });
            }
          };
          pc.ontrack = (event: any) => {
            const stream = event.streams?.[0];
            if (!stream) return;
            setRemoteCount(1);
            setHasRemoteVideo(stream.getVideoTracks().length > 0);
            setRemoteStreamUrl(typeof stream.toURL === "function" ? stream.toURL() : undefined);
          };
          pc.onaddstream = (event: any) => {
            const stream = event.stream;
            if (!stream) return;
            setRemoteCount(1);
            setHasRemoteVideo(stream.getVideoTracks().length > 0);
            setRemoteStreamUrl(typeof stream.toURL === "function" ? stream.toURL() : undefined);
          };
          pc.onconnectionstatechange = () => {
            if (pc.connectionState === "connected") setJoined(true);
            if (pc.connectionState === "failed") setError("Call connection failed.");
          };

          if (roleRef.current === "caller") {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            await postJson(`/sessions/${encodeURIComponent(channel)}/offer`, { offer });
          }

          pollTimer = setInterval(async () => {
            const pcNow = pcRef.current;
            if (stopped || !pcNow) return;
            const session = await fetch(`${baseUrl}/api/webrtc/sessions/${encodeURIComponent(channel)}`).then((r) => r.json()) as {
              session?: { offer?: RTCSessionDescriptionInit | null; answer?: RTCSessionDescriptionInit | null };
            };
            if (roleRef.current === "callee" && session.session?.offer && !pcNow.remoteDescription) {
              await pcNow.setRemoteDescription(new RTCSessionDescription(session.session.offer));
              const answer = await pcNow.createAnswer();
              await pcNow.setLocalDescription(answer);
              await postJson(`/sessions/${encodeURIComponent(channel)}/answer`, { answer });
            }
            if (roleRef.current === "caller" && session.session?.answer && !pcNow.remoteDescription) {
              await pcNow.setRemoteDescription(new RTCSessionDescription(session.session.answer));
            }

            const candidateRes = await fetch(`${baseUrl}/api/webrtc/sessions/${encodeURIComponent(channel)}/candidates?role=${roleRef.current}&since=${candidateCursorRef.current}`).then((r) => r.json()) as {
              candidates?: RTCIceCandidateInit[];
              next?: number;
            };
            for (const candidate of candidateRes.candidates ?? []) {
              await pcNow.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
            }
            candidateCursorRef.current = candidateRes.next ?? candidateCursorRef.current;
          }, 1200);
        } catch (e: any) {
          const msg = e?.message ?? "";
          if (msg.includes("Cannot find module") || msg.includes("TurboModuleRegistry") || msg.includes("NativeModules")) {
            setError("SELF_HOSTED_WEBRTC_NATIVE_REQUIRED");
          } else {
            setError(msg || "Failed to start native self-hosted call.");
          }
        }
      };

      connectNative();
      return () => {
        stopped = true;
        if (pollTimer) clearInterval(pollTimer);
        localStreamRef.current?.getTracks?.().forEach((track: any) => track.stop());
        pcRef.current?.close?.();
        fetch(`${baseUrl}/api/webrtc/sessions/${encodeURIComponent(channel)}`, { method: "DELETE" }).catch(() => {});
      };
    }

    let stopped = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    const baseUrl = getApiUrl();

    const postJson = async (path: string, body: unknown) => {
      await fetch(`${baseUrl}/api/webrtc${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    };

    const connect = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setError("WebRTC is not supported in this browser.");
          return;
        }

        const sessionRes = await fetch(`${baseUrl}/api/webrtc/sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channel, userId: uid, type: isVideo ? "video" : "audio" }),
        });
        const sessionData = await sessionRes.json() as { success?: boolean; role?: Role };
        if (!sessionData.success || !sessionData.role) throw new Error("Could not start call signaling.");
        roleRef.current = sessionData.role;

        const localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: isVideo });
        localStreamRef.current = localStream;
        setTimeout(() => {
          const el = document.getElementById(localVideoId) as HTMLVideoElement | null;
          if (el) {
            el.srcObject = localStream;
            el.muted = true;
            void el.play().catch(() => {});
          }
        }, 100);

        const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
        pcRef.current = pc;
        localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            void postJson(`/sessions/${encodeURIComponent(channel)}/candidates`, {
              role: roleRef.current,
              candidate: event.candidate.toJSON(),
            });
          }
        };
        pc.ontrack = (event) => {
          const [stream] = event.streams;
          const el = document.getElementById(remoteVideoId) as HTMLVideoElement | null;
          if (stream && el) {
            el.srcObject = stream;
            void el.play().catch(() => {});
            setRemoteCount(1);
            setHasRemoteVideo(stream.getVideoTracks().length > 0);
          }
        };
        pc.onconnectionstatechange = () => {
          if (pc.connectionState === "connected") setJoined(true);
          if (pc.connectionState === "failed") setError("Call connection failed.");
        };

        if (roleRef.current === "caller") {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await postJson(`/sessions/${encodeURIComponent(channel)}/offer`, { offer });
        }

        pollTimer = setInterval(async () => {
          const pcNow = pcRef.current;
          if (stopped || !pcNow) return;
          const session = await fetch(`${baseUrl}/api/webrtc/sessions/${encodeURIComponent(channel)}`).then((r) => r.json()) as {
            session?: { offer?: RTCSessionDescriptionInit | null; answer?: RTCSessionDescriptionInit | null };
          };
          if (roleRef.current === "callee" && session.session?.offer && !pcNow.remoteDescription) {
            await pcNow.setRemoteDescription(session.session.offer);
            const answer = await pcNow.createAnswer();
            await pcNow.setLocalDescription(answer);
            await postJson(`/sessions/${encodeURIComponent(channel)}/answer`, { answer });
          }
          if (roleRef.current === "caller" && session.session?.answer && !pcNow.remoteDescription) {
            await pcNow.setRemoteDescription(session.session.answer);
          }

          const candidateRes = await fetch(`${baseUrl}/api/webrtc/sessions/${encodeURIComponent(channel)}/candidates?role=${roleRef.current}&since=${candidateCursorRef.current}`).then((r) => r.json()) as {
            candidates?: RTCIceCandidateInit[];
            next?: number;
          };
          for (const candidate of candidateRes.candidates ?? []) await pcNow.addIceCandidate(candidate).catch(() => {});
          candidateCursorRef.current = candidateRes.next ?? candidateCursorRef.current;
        }, 1200);
      } catch (e: any) {
        setError(e?.message ?? "Failed to start self-hosted call.");
      }
    };

    connect();
    return () => {
      stopped = true;
      if (pollTimer) clearInterval(pollTimer);
      localStreamRef.current?.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      pcRef.current?.close();
      fetch(`${baseUrl}/api/webrtc/sessions/${encodeURIComponent(channel)}`, { method: "DELETE" }).catch(() => {});
    };
  }, [channel, uid, isVideo, localVideoId, remoteVideoId]);

  return {
    joined,
    error,
    muted,
    cameraOff,
    speakerOn,
    remoteCount,
    localVideoId,
    remoteVideoId,
    localStreamUrl,
    remoteStreamUrl,
    hasRemoteVideo,
    remoteUid: null,
    toggleMute: () => {
      localStreamRef.current?.getAudioTracks().forEach((track: MediaStreamTrack) => { track.enabled = muted; });
      setMuted((m) => !m);
    },
    toggleCamera: () => {
      localStreamRef.current?.getVideoTracks().forEach((track: MediaStreamTrack) => { track.enabled = cameraOff; });
      setCameraOff((c) => !c);
    },
    toggleSpeaker: () => setSpeakerOn((s) => !s),
    leave: async () => {
      localStreamRef.current?.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      pcRef.current?.close();
    },
  };
}

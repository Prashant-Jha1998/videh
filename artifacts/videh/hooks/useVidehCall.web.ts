import { useEffect, useRef, useState } from "react";
import { getApiUrl } from "@/lib/api";
import type { VidehCallState } from "./useVidehCall.native";

type Role = "caller" | "callee";

const ICE_SERVERS: RTCIceServer[] = [
  // STUN is not a call API. It only helps peers discover network routes.
  { urls: "stun:stun.l.google.com:19302" },
];

export function useVidehCall(channel: string, uid: number, isVideo: boolean): VidehCallState {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const roleRef = useRef<Role>("caller");
  const candidateCursorRef = useRef(0);

  const [joined, setJoined] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [remoteCount, setRemoteCount] = useState(0);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const localVideoId = `videh-local-${channel}`;
  const remoteVideoId = `videh-remote-${channel}`;

  useEffect(() => {
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

    const attachLocalVideo = () => {
      const el = document.getElementById(localVideoId) as HTMLVideoElement | null;
      if (el && localStreamRef.current && el.srcObject !== localStreamRef.current) {
        el.srcObject = localStreamRef.current;
        el.muted = true;
        void el.play().catch(() => {});
      }
    };

    const attachRemoteVideo = (stream: MediaStream) => {
      const el = document.getElementById(remoteVideoId) as HTMLVideoElement | null;
      if (el && el.srcObject !== stream) {
        el.srcObject = stream;
        void el.play().catch(() => {});
      }
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
        setTimeout(attachLocalVideo, 100);

        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
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
          if (!stream) return;
          setRemoteCount(1);
          setHasRemoteVideo(stream.getVideoTracks().length > 0);
          setTimeout(() => attachRemoteVideo(stream), 100);
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
          if (stopped || !pcRef.current) return;
          const pcNow = pcRef.current;
          const session = await fetch(`${baseUrl}/api/webrtc/sessions/${encodeURIComponent(channel)}`).then((r) => r.json()) as {
            success?: boolean;
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
            success?: boolean;
            candidates?: RTCIceCandidateInit[];
            next?: number;
          };
          for (const candidate of candidateRes.candidates ?? []) {
            await pcNow.addIceCandidate(candidate).catch(() => {});
          }
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
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      pcRef.current?.close();
      fetch(`${baseUrl}/api/webrtc/sessions/${encodeURIComponent(channel)}`, { method: "DELETE" }).catch(() => {});
    };
  }, [channel, uid, isVideo]);

  const toggleMute = () => {
    localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = muted; });
    setMuted((m) => !m);
  };

  const toggleCamera = () => {
    localStreamRef.current?.getVideoTracks().forEach((track) => { track.enabled = cameraOff; });
    setCameraOff((c) => !c);
  };

  return {
    joined,
    error,
    muted,
    cameraOff,
    speakerOn,
    remoteCount,
    localVideoId,
    remoteVideoId,
    hasRemoteVideo,
    remoteUid: null,
    toggleMute,
    toggleCamera,
    toggleSpeaker: () => setSpeakerOn((s) => !s),
    leave: async () => {
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      pcRef.current?.close();
    },
  };
}

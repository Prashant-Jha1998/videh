import { useCallback, useEffect, useRef, useState } from "react";
import { connectMeshPeersStaggered } from "@/lib/meshPeerConnect";
import { channelsForCall, peerIdFromCallChannel } from "@/lib/webrtcIce";
import { buildRtcConfiguration } from "@/lib/webrtcRtcConfig";
import { webrtcFetch } from "@/lib/webrtcApi";
import type { RemoteCallPeerStream } from "./videhCallTypes";
import { startScreenShare, stopScreenShare as stopScreenShareTracks } from "@/lib/screenShare";
import type { VidehCallState } from "./videhCallTypes";

export type { VidehCallState } from "./videhCallTypes";

type Role = "caller" | "callee";
const SIGNAL_POLL_MS = 250;

export function useVidehCall(
  baseChannel: string,
  uid: number,
  isVideo: boolean,
  remotePeerIds: number[] = [],
  sessionToken?: string | null,
): VidehCallState {
  const channels = channelsForCall(baseChannel, uid, remotePeerIds);
  const primaryChannel = channels[0] ?? "";

  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const cameraVideoTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenSharingRef = useRef(false);
  const rolesRef = useRef<Map<string, Role>>(new Map());
  const candidateCursorsRef = useRef<Map<string, number>>(new Map());
  const pollTimersRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  const [joined, setJoined] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [remoteCount, setRemoteCount] = useState(0);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [remotePeers, setRemotePeers] = useState<RemoteCallPeerStream[]>([]);
  const remotePeersRef = useRef<Map<number, { stream?: MediaStream; hasVideo: boolean }>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const localVideoId = `videh-local-${primaryChannel}`;
  const remoteVideoId = `videh-remote-${primaryChannel}`;

  const refreshAggregate = useCallback(() => {
    const connected = [...pcsRef.current.values()].filter((pc) => pc.connectionState === "connected").length;
    setJoined(connected > 0);
    setRemoteCount(connected);
    const list: RemoteCallPeerStream[] = [...remotePeersRef.current.entries()].map(([peerId, p]) => ({
      peerId,
      hasVideo: p.hasVideo,
      streamUrl: p.stream ? `web-peer-${peerId}` : undefined,
    }));
    setRemotePeers(list);
    const firstVideo = list.find((p) => p.hasVideo);
    setHasRemoteVideo(Boolean(firstVideo));
  }, []);

  useEffect(() => {
    if (!primaryChannel || !uid) return;

    let stopped = false;

    const postJson = async (path: string, body: unknown) => {
      await webrtcFetch(path, sessionToken, { method: "POST", body: JSON.stringify(body) });
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

    const connectChannel = async (channel: string, sharedLocalStream: MediaStream) => {
      const sessionRes = await webrtcFetch("/sessions", sessionToken, {
        method: "POST",
        body: JSON.stringify({ channel, userId: uid, type: isVideo ? "video" : "audio" }),
      });
      const sessionData = await sessionRes.json() as { success?: boolean; role?: Role };
      if (!sessionData.success || !sessionData.role) throw new Error("Could not start call signaling.");
      const role = sessionData.role;
      rolesRef.current.set(channel, role);
      candidateCursorsRef.current.set(channel, 0);

      const rtcConfig = await buildRtcConfiguration(sessionToken, remotePeerIds.length + 1);
      const pc = new RTCPeerConnection(rtcConfig);
      pcsRef.current.set(channel, pc);
      sharedLocalStream.getTracks().forEach((track) => pc.addTrack(track, sharedLocalStream));
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          void postJson(`/sessions/${encodeURIComponent(channel)}/candidates`, {
            role,
            candidate: event.candidate.toJSON(),
          });
        }
      };
      pc.ontrack = (event) => {
        const [stream] = event.streams;
        if (!stream) return;
        const peerId = peerIdFromCallChannel(channel, uid) || remotePeerIds[0] || 0;
        remotePeersRef.current.set(peerId, { stream, hasVideo: stream.getVideoTracks().length > 0 });
        if (remotePeerIds.length <= 1) setTimeout(() => attachRemoteVideo(stream), 100);
        refreshAggregate();
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" && pcsRef.current.size <= 1) {
          setError("Call connection failed.");
        }
        refreshAggregate();
      };

      if (role === "caller") {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await postJson(`/sessions/${encodeURIComponent(channel)}/offer`, { offer });
      }

      const pollTimer = setInterval(async () => {
        const pcNow = pcsRef.current.get(channel);
        if (stopped || !pcNow) return;
        const activeRole = rolesRef.current.get(channel) ?? "caller";
        const session = await webrtcFetch(`/sessions/${encodeURIComponent(channel)}`, sessionToken).then((r) => r.json()) as {
          session?: { offer?: RTCSessionDescriptionInit | null; answer?: RTCSessionDescriptionInit | null };
        };
        if (activeRole === "callee" && session.session?.offer && !pcNow.remoteDescription) {
          await pcNow.setRemoteDescription(session.session.offer);
          const answer = await pcNow.createAnswer();
          await pcNow.setLocalDescription(answer);
          await postJson(`/sessions/${encodeURIComponent(channel)}/answer`, { answer });
        }
        if (activeRole === "caller" && session.session?.answer && !pcNow.remoteDescription) {
          await pcNow.setRemoteDescription(session.session.answer);
        }

        const since = candidateCursorsRef.current.get(channel) ?? 0;
        const candidateRes = await webrtcFetch(
          `/sessions/${encodeURIComponent(channel)}/candidates?role=${activeRole}&since=${since}`,
          sessionToken,
        ).then((r) => r.json()) as { candidates?: RTCIceCandidateInit[]; next?: number };
        for (const candidate of candidateRes.candidates ?? []) {
          await pcNow.addIceCandidate(candidate).catch(() => {});
        }
        candidateCursorsRef.current.set(channel, candidateRes.next ?? since);
      }, SIGNAL_POLL_MS);
      pollTimersRef.current.set(channel, pollTimer);
    };

    const connectAll = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setError("WebRTC is not supported in this browser.");
          return;
        }
        const localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: isVideo });
        localStreamRef.current = localStream;
        cameraVideoTrackRef.current = localStream.getVideoTracks()[0] ?? null;
        setTimeout(attachLocalVideo, 100);
        await connectMeshPeersStaggered(channels, async (channel) => {
          await connectChannel(channel, localStream);
        });
      } catch (e: any) {
        setError(e?.message ?? "Failed to start self-hosted call.");
      }
    };

    void connectAll();

    return () => {
      stopped = true;
      for (const timer of pollTimersRef.current.values()) clearInterval(timer);
      pollTimersRef.current.clear();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      for (const pc of pcsRef.current.values()) pc.close();
      pcsRef.current.clear();
      for (const channel of channels) {
        webrtcFetch(`/sessions/${encodeURIComponent(channel)}`, sessionToken, { method: "DELETE" }).catch(() => {});
      }
    };
  }, [primaryChannel, uid, isVideo, channels.join("|"), localVideoId, remoteVideoId, sessionToken]);

  return {
    joined,
    connectionPhase: joined ? "connected" as const : error ? "failed" as const : "connecting" as const,
    error,
    muted,
    cameraOff,
    speakerOn,
    remoteCount,
    localVideoId,
    remoteVideoId,
    hasRemoteVideo,
    remoteUid: null,
    remotePeers,
    toggleMute: () => {
      localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = muted; });
      setMuted((m) => !m);
    },
    toggleCamera: () => {
      localStreamRef.current?.getVideoTracks().forEach((track) => { track.enabled = cameraOff; });
      setCameraOff((c) => !c);
    },
    toggleSpeaker: () => {
      setSpeakerOn((s) => {
        const next = !s;
        const tracks = localStreamRef.current?.getAudioTracks() ?? [];
        for (const track of tracks) {
          const sinkId = (track as any).setSinkId;
          if (typeof sinkId === "function") {
            void sinkId.call(track, next ? "default" : "communications").catch(() => {});
          }
        }
        return next;
      });
    },
    setSpeaker: (enabled: boolean) => {
      setSpeakerOn(enabled);
      const tracks = localStreamRef.current?.getAudioTracks() ?? [];
      for (const track of tracks) {
        const sinkId = (track as any).setSinkId;
        if (typeof sinkId === "function") {
          void sinkId.call(track, enabled ? "default" : "communications").catch(() => {});
        }
      }
    },
    setHeld: () => {},
    shareScreen: async () => {
      const screenStream = await startScreenShare();
      const screenTrack = screenStream?.getVideoTracks()[0];
      if (!screenTrack) return false;
      screenSharingRef.current = true;
      for (const pc of pcsRef.current.values()) {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender) await sender.replaceTrack(screenTrack);
      }
      const el = document.getElementById(localVideoId) as HTMLVideoElement | null;
      if (el) {
        el.srcObject = screenStream;
        void el.play().catch(() => {});
      }
      screenTrack.onended = () => {
        void stopScreenShareTracks();
        screenSharingRef.current = false;
        const cam = cameraVideoTrackRef.current;
        if (cam) {
          for (const pc of pcsRef.current.values()) {
            const sender = pc.getSenders().find((s) => s.track?.kind === "video");
            if (sender) void sender.replaceTrack(cam);
          }
          if (el && localStreamRef.current) el.srcObject = localStreamRef.current;
        }
      };
      return true;
    },
    stopScreenShare: async () => {
      if (!screenSharingRef.current) return;
      await stopScreenShareTracks();
      screenSharingRef.current = false;
      const cam = cameraVideoTrackRef.current;
      if (!cam) return;
      for (const pc of pcsRef.current.values()) {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender) await sender.replaceTrack(cam);
      }
      const el = document.getElementById(localVideoId) as HTMLVideoElement | null;
      if (el && localStreamRef.current) el.srcObject = localStreamRef.current;
    },
    leave: async () => {
      await stopScreenShareTracks();
      screenSharingRef.current = false;
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      for (const pc of pcsRef.current.values()) pc.close();
    },
  };
}

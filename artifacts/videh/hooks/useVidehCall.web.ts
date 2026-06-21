  import { useCallback, useEffect, useRef, useState } from "react";
  import { channelsForCall, loadIceServers } from "@/lib/webrtcIce";
  import { webrtcFetch } from "@/lib/webrtcApi";
  import { startScreenShare, stopScreenShare as stopScreenShareTracks } from "@/lib/screenShare";
  import type { VidehCallState } from "./videhCallTypes";

  export type { VidehCallState } from "./videhCallTypes";

  type Role = "caller" | "callee";
  const SIGNAL_POLL_MS = 80;

  export function useVidehCall(
    baseChannel: string,
    uid: number,
    isVideo: boolean,
    remotePeerIds: number[] = [],
    sessionToken?: string | null,
    videhCallerId = 0,
    _callId: string | null = null,
    _negotiateBump = 0,
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
    const pollBusyRef = useRef<Set<string>>(new Set());
    const lastOfferRevisionRef = useRef<Map<string, number>>(new Map());
    const lastAnswerRevisionRef = useRef<Map<string, number>>(new Map());

    const [joined, setJoined] = useState(false);
    const [muted, setMuted] = useState(false);
    const [cameraOff, setCameraOff] = useState(false);
    const [speakerOn, setSpeakerOn] = useState(true);
    const [remoteCount, setRemoteCount] = useState(0);
    const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const localVideoId = `videh-local-${primaryChannel}`;
    const remoteVideoId = `videh-remote-${primaryChannel}`;

    const refreshAggregate = useCallback(() => {
      const connected = [...pcsRef.current.values()].filter((pc) => pc.connectionState === "connected").length;
      setJoined(connected > 0);
      setRemoteCount(connected);
    }, []);

    useEffect(() => {
      if (!primaryChannel || !uid || videhCallerId <= 0) return;

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

      const connectChannel = async (channel: string, sharedLocalStream: MediaStream, iceServers: RTCIceServer[]) => {
        const existing = pcsRef.current.get(channel);
        if (existing) {
          const t = pollTimersRef.current.get(channel);
          if (t) clearInterval(t);
          pollTimersRef.current.delete(channel);
          existing.close();
          pcsRef.current.delete(channel);
        }
        const sessionRes = await webrtcFetch("/sessions", sessionToken, {
          method: "POST",
          body: JSON.stringify({
            channel,
            userId: uid,
            type: isVideo ? "video" : "audio",
            videhCallerId,
          }),
        });
        const sessionData = await sessionRes.json() as { success?: boolean; role?: Role };
        if (!sessionData.success || !sessionData.role) throw new Error("Could not start call signaling.");
        const role = sessionData.role;
        rolesRef.current.set(channel, role);
        candidateCursorsRef.current.set(channel, 0);

        const pc = new RTCPeerConnection({ iceServers });
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
          setHasRemoteVideo(stream.getVideoTracks().length > 0);
          setTimeout(() => attachRemoteVideo(stream), 100);
          refreshAggregate();
        };
        pc.onconnectionstatechange = () => {
          if (pc.connectionState === "failed") setError("Call connection failed.");
          refreshAggregate();
        };

        if (role === "caller") {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await postJson(`/sessions/${encodeURIComponent(channel)}/offer`, { offer });
        }

        const pollTimer = setInterval(() => {
          if (pollBusyRef.current.has(channel)) return;
          pollBusyRef.current.add(channel);
          void (async () => {
            try {
              const pcNow = pcsRef.current.get(channel);
              if (stopped || !pcNow) return;
              const activeRole = rolesRef.current.get(channel) ?? "caller";
              const session = await webrtcFetch(`/sessions/${encodeURIComponent(channel)}`, sessionToken).then((r) => r.json()) as {
                session?: {
                  offer?: RTCSessionDescriptionInit | null;
                  answer?: RTCSessionDescriptionInit | null;
                  offerRevision?: number;
                  answerRevision?: number;
                };
              };
              const offerRevision = session.session?.offerRevision ?? 0;
              const seenOfferRev = lastOfferRevisionRef.current.get(channel) ?? -1;
              if (activeRole === "callee" && session.session?.offer && offerRevision > seenOfferRev) {
                lastOfferRevisionRef.current.set(channel, offerRevision);
                await pcNow.setRemoteDescription(session.session.offer);
                const answer = await pcNow.createAnswer();
                await pcNow.setLocalDescription(answer);
                await postJson(`/sessions/${encodeURIComponent(channel)}/answer`, { answer });
              }
              const answerRevision = session.session?.answerRevision ?? 0;
              const seenAnswerRev = lastAnswerRevisionRef.current.get(channel) ?? -1;
              if (activeRole === "caller" && session.session?.answer && answerRevision > seenAnswerRev) {
                lastAnswerRevisionRef.current.set(channel, answerRevision);
                const sig = pcNow.signalingState;
                if (sig === "have-local-offer" || sig === "stable") {
                  await pcNow.setRemoteDescription(session.session.answer);
                }
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
            } finally {
              pollBusyRef.current.delete(channel);
            }
          })();
        }, SIGNAL_POLL_MS);
        pollTimersRef.current.set(channel, pollTimer);
      };

      const connectAll = async () => {
        try {
          if (!navigator.mediaDevices?.getUserMedia) {
            setError("WebRTC is not supported in this browser.");
            return;
          }
          const iceServers = await loadIceServers(sessionToken);
          const localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: isVideo });
          localStreamRef.current = localStream;
          cameraVideoTrackRef.current = localStream.getVideoTracks()[0] ?? null;
          setTimeout(attachLocalVideo, 100);
          for (const channel of channels) {
            await connectChannel(channel, localStream, iceServers);
          }
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
    }, [primaryChannel, uid, isVideo, channels.join("|"), localVideoId, remoteVideoId, refreshAggregate, sessionToken, videhCallerId]);

    return {
      joined,
      mediaReady: joined,
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
      remotePeers: [],
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

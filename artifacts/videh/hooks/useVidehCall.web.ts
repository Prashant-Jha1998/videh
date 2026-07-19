import { useCallback, useEffect, useRef, useState } from "react";
import { callDebug } from "@/lib/callDebug";
import { channelsForCall, loadIceServers, peerIdFromCallChannel } from "@/lib/webrtcIce";
import { webrtcFetch } from "@/lib/webrtcApi";
import { startScreenShare, stopScreenShare as stopScreenShareTracks } from "@/lib/screenShare";
import type { VidehCallState } from "./videhCallTypes";

export type { VidehCallState } from "./videhCallTypes";

type Role = "caller" | "callee";
const SIGNAL_POLL_MS = 80;
const SIGNAL_POLL_CONNECTED_MS = 1200;
const ICE_RESTART_DELAY_MS = 5000;

export function useVidehCall(
  baseChannel: string,
  uid: number,
  isVideo: boolean,
  remotePeerIds: number[] = [],
  sessionToken?: string | null,
  videhCallerId = 0,
  callId: string | null = null,
  negotiateBump = 0,
): VidehCallState {
  const channels = channelsForCall(baseChannel, uid, remotePeerIds);
  const primaryChannel = channels[0] ?? "";

  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const cameraVideoTrackRef = useRef<MediaStreamTrack | null>(null);
  const facingModeRef = useRef<"user" | "environment">("user");
  const screenSharingRef = useRef(false);
  const rolesRef = useRef<Map<string, Role>>(new Map());
  const candidateCursorsRef = useRef<Map<string, number>>(new Map());
  const pollTimersRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const pollBusyRef = useRef<Set<string>>(new Set());
  const lastOfferRevisionRef = useRef<Map<string, number>>(new Map());
  const lastAnswerRevisionRef = useRef<Map<string, number>>(new Map());
  const offerProcessingRef = useRef<Set<string>>(new Set());
  const connectGenRef = useRef(0);
  const connectedNotifiedRef = useRef(false);
  const iceRestartTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const iceRestartInFlightRef = useRef<Set<string>>(new Set());
  const remotePeerIdsRef = useRef(remotePeerIds);
  remotePeerIdsRef.current = remotePeerIds;

  const [joined, setJoined] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [isFrontCamera, setIsFrontCamera] = useState(true);
  const [localVideoRevision, setLocalVideoRevision] = useState(0);
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

    const connectGen = ++connectGenRef.current;
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

    const processSessionSignal = async (
      pollChannel: string,
      pcNow: RTCPeerConnection,
      activeRole: Role,
      session: {
        offer?: RTCSessionDescriptionInit | null;
        answer?: RTCSessionDescriptionInit | null;
        offerRevision?: number;
        answerRevision?: number;
      },
    ) => {
      const offerRevision = session.offerRevision ?? 0;
      const seenOfferRev = lastOfferRevisionRef.current.get(pollChannel) ?? -1;
      const hasOffer = Boolean(session.offer);

      if (
        activeRole === "callee"
        && hasOffer
        && offerRevision > seenOfferRev
        && !offerProcessingRef.current.has(pollChannel)
      ) {
        offerProcessingRef.current.add(pollChannel);
        try {
          callDebug("RECEIVING_OFFER", { channel: pollChannel, offerRevision, role: activeRole, callId });
          await pcNow.setRemoteDescription(session.offer!);
          const answer = await pcNow.createAnswer();
          await pcNow.setLocalDescription(answer);
          await postJson(`/sessions/${encodeURIComponent(pollChannel)}/answer`, { answer });
          lastOfferRevisionRef.current.set(pollChannel, offerRevision);
          callDebug("ANSWER_SENT", { channel: pollChannel, role: activeRole, offerRevision, callId });
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          callDebug("ANSWER_FAILED", { channel: pollChannel, role: activeRole, message, callId });
          setError("Could not complete call setup.");
        } finally {
          offerProcessingRef.current.delete(pollChannel);
        }
      } else if (activeRole === "callee" && !hasOffer) {
        callDebug("CALLEE_WAITING_FOR_OFFER", { channel: pollChannel, role: activeRole, callId });
      }

      const answerRevision = session.answerRevision ?? 0;
      const seenAnswerRev = lastAnswerRevisionRef.current.get(pollChannel) ?? -1;
      if (activeRole === "caller" && session.answer && answerRevision > seenAnswerRev) {
        lastAnswerRevisionRef.current.set(pollChannel, answerRevision);
        const sig = pcNow.signalingState;
        if (sig === "have-local-offer" || sig === "stable") {
          callDebug("RECEIVING_ANSWER", { channel: pollChannel, answerRevision, role: activeRole, callId });
          await pcNow.setRemoteDescription(session.answer);
        }
      }

      const since = candidateCursorsRef.current.get(pollChannel) ?? 0;
      const candidateRes = await webrtcFetch(
        `/sessions/${encodeURIComponent(pollChannel)}/candidates?role=${activeRole}&since=${since}`,
        sessionToken,
      ).then((r) => r.json()) as { candidates?: RTCIceCandidateInit[]; next?: number };
      for (const candidate of candidateRes.candidates ?? []) {
        await pcNow.addIceCandidate(candidate).catch(() => {});
      }
      candidateCursorsRef.current.set(pollChannel, candidateRes.next ?? since);
    };

    const pollSignalOnce = (pollChannel: string) => {
      if (pollBusyRef.current.has(pollChannel)) return;
      pollBusyRef.current.add(pollChannel);
      void (async () => {
        try {
          const pcNow = pcsRef.current.get(pollChannel);
          if (stopped || !pcNow) return;
          const activeRole = rolesRef.current.get(pollChannel) ?? "caller";
          const sessionRes = await webrtcFetch(
            `/sessions/${encodeURIComponent(pollChannel)}?_=${Date.now()}`,
            sessionToken,
          );
          if (!sessionRes.ok) return;
          const payload = await sessionRes.json() as {
            session?: {
              offer?: RTCSessionDescriptionInit | null;
              answer?: RTCSessionDescriptionInit | null;
              offerRevision?: number;
              answerRevision?: number;
            };
          };
          if (!payload.session) return;
          await processSessionSignal(pollChannel, pcNow, activeRole, payload.session);
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          callDebug("SIGNAL_POLL_ERROR", { channel: pollChannel, message, callId });
        } finally {
          pollBusyRef.current.delete(pollChannel);
        }
      })();
    };

    const schedulePoll = (channel: string, ms: number) => {
      const existing = pollTimersRef.current.get(channel);
      if (existing) clearInterval(existing);
      const timer = setInterval(() => pollSignalOnce(channel), ms);
      pollTimersRef.current.set(channel, timer);
    };

    const shouldInitiateIceRestart = (channel: string): boolean => {
      const peerId = peerIdFromCallChannel(channel, uid) || remotePeerIdsRef.current[0];
      if (!peerId || peerId === uid) return true;
      return uid < peerId;
    };

    const scheduleIceRestart = (channel: string, role: Role) => {
      if (stopped || iceRestartInFlightRef.current.has(channel)) return;
      if (iceRestartTimersRef.current.has(channel)) return;
      const timer = setTimeout(() => {
        iceRestartTimersRef.current.delete(channel);
        void (async () => {
          const pcNow = pcsRef.current.get(channel);
          if (stopped || !pcNow) return;
          if (pcNow.connectionState === "connected") return;
          if (!shouldInitiateIceRestart(channel)) return;
          iceRestartInFlightRef.current.add(channel);
          try {
            if (typeof pcNow.restartIce === "function") pcNow.restartIce();
            const offer = await pcNow.createOffer({ iceRestart: true });
            await pcNow.setLocalDescription(offer);
            const res = await webrtcFetch(`/sessions/${encodeURIComponent(channel)}/offer`, sessionToken, {
              method: "POST",
              body: JSON.stringify({ offer, iceRestart: true }),
            });
            const payload = (await res.json()) as { offerRevision?: number };
            if (typeof payload.offerRevision === "number") {
              lastOfferRevisionRef.current.set(channel, payload.offerRevision);
            }
            candidateCursorsRef.current.set(channel, 0);
            if (role === "caller") lastAnswerRevisionRef.current.delete(channel);
            schedulePoll(channel, SIGNAL_POLL_MS);
          } catch {
            /* retry on next disconnect */
          } finally {
            iceRestartInFlightRef.current.delete(channel);
          }
        })();
      }, ICE_RESTART_DELAY_MS);
      iceRestartTimersRef.current.set(channel, timer);
    };

    const connectChannel = async (channel: string, sharedLocalStream: MediaStream, iceServers: RTCIceServer[]) => {
      if (connectGen !== connectGenRef.current || stopped) return;

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
      const sessionData = await sessionRes.json() as {
        success?: boolean;
        role?: Role;
        session?: {
          offer?: RTCSessionDescriptionInit | null;
          answer?: RTCSessionDescriptionInit | null;
          offerRevision?: number;
          answerRevision?: number;
        };
      };
      if (connectGen !== connectGenRef.current || stopped) return;
      if (!sessionData.success || !sessionData.role) throw new Error("Could not start call signaling.");

      const role = sessionData.role;
      rolesRef.current.set(channel, role);
      candidateCursorsRef.current.set(channel, 0);
      callDebug("CREATING_PEER_CONNECTION", { channel, role, uid, videhCallerId, callId });

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
        const state = pc.connectionState;
        if (state === "connected") {
          callDebug("PEER_CONNECTION_CONNECTED", { channel, role, uid, callId });
          const t = iceRestartTimersRef.current.get(channel);
          if (t) {
            clearTimeout(t);
            iceRestartTimersRef.current.delete(channel);
          }
          setError(null);
          schedulePoll(channel, SIGNAL_POLL_CONNECTED_MS);
          if (!connectedNotifiedRef.current && callId && sessionToken) {
            connectedNotifiedRef.current = true;
            void webrtcFetch(`/calls/${callId}/connected`, sessionToken, {
              method: "POST",
              body: JSON.stringify({ userId: uid }),
            }).catch(() => {});
          }
        } else if (state === "failed") {
          const t = iceRestartTimersRef.current.get(channel);
          if (t) {
            clearTimeout(t);
            iceRestartTimersRef.current.delete(channel);
          }
          schedulePoll(channel, SIGNAL_POLL_MS);
          scheduleIceRestart(channel, role);
        } else if (state === "disconnected" || state === "connecting") {
          schedulePoll(channel, SIGNAL_POLL_MS);
        }
        refreshAggregate();
      };

      if (role === "caller") {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        callDebug("SENDING_OFFER", { channel, role, callId });
        await postJson(`/sessions/${encodeURIComponent(channel)}/offer`, { offer });
        pollSignalOnce(channel);
      } else if (sessionData.session) {
        await processSessionSignal(channel, pc, role, sessionData.session);
      }

      if (connectGen !== connectGenRef.current || stopped) {
        pc.close();
        return;
      }

      schedulePoll(channel, SIGNAL_POLL_MS);
      pollSignalOnce(channel);
    };

    const connectAll = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setError("WebRTC is not supported in this browser.");
          return;
        }
        const iceServers = await loadIceServers(sessionToken);
        const localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: isVideo });
        if (connectGen !== connectGenRef.current || stopped) {
          localStream.getTracks().forEach((track) => track.stop());
          return;
        }
        localStreamRef.current = localStream;
        cameraVideoTrackRef.current = localStream.getVideoTracks()[0] ?? null;
        setTimeout(attachLocalVideo, 100);
        for (const channel of channels) {
          if (stopped || connectGen !== connectGenRef.current) return;
          await connectChannel(channel, localStream, iceServers);
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to start self-hosted call.";
        setError(message);
      }
    };

    void connectAll();

    return () => {
      stopped = true;
      for (const timer of pollTimersRef.current.values()) clearInterval(timer);
      pollTimersRef.current.clear();
      for (const timer of iceRestartTimersRef.current.values()) clearTimeout(timer);
      iceRestartTimersRef.current.clear();
      iceRestartInFlightRef.current.clear();
      pollBusyRef.current.clear();
      offerProcessingRef.current.clear();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      for (const pc of pcsRef.current.values()) pc.close();
      pcsRef.current.clear();
      for (const channel of channels) {
        webrtcFetch(`/sessions/${encodeURIComponent(channel)}`, sessionToken, { method: "DELETE" }).catch(() => {});
      }
    };
  }, [primaryChannel, uid, isVideo, channels.join("|"), localVideoId, remoteVideoId, refreshAggregate, sessionToken, videhCallerId, callId, negotiateBump]);

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
    flipCamera: async () => {
      const track = localStreamRef.current?.getVideoTracks()[0];
      if (!track) return;
      const next = facingModeRef.current === "user" ? "environment" : "user";
      facingModeRef.current = next;
      setIsFrontCamera(next === "user");
      try {
        const fresh = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: next },
        });
        const newTrack = fresh.getVideoTracks()[0];
        if (!newTrack) return;
        track.stop();
        const stream = localStreamRef.current;
        if (stream) {
          stream.removeTrack(track);
          stream.addTrack(newTrack);
        }
        cameraVideoTrackRef.current = newTrack;
        for (const pc of pcsRef.current.values()) {
          const sender = pc.getSenders().find((s) => s.track?.kind === "video");
          if (sender) await sender.replaceTrack(newTrack);
        }
      } catch { /* ignore */ }
    },
    isFrontCamera,
    localVideoRevision,
    toggleSpeaker: () => {
      setSpeakerOn((s) => {
        const next = !s;
        const tracks = localStreamRef.current?.getAudioTracks() ?? [];
        for (const track of tracks) {
          const sinkId = (track as MediaStreamTrack & { setSinkId?: (id: string) => Promise<void> }).setSinkId;
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
        const sinkId = (track as MediaStreamTrack & { setSinkId?: (id: string) => Promise<void> }).setSinkId;
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

import { useCallback, useEffect, useRef, useState } from "react";
import { PermissionsAndroid, Platform } from "react-native";
import { applySpeakerRoute, setProximityScreenOff, startInCallSession, stopInCallSession } from "@/lib/inCallAudio";
import { buildCallMediaConstraints, getCallMediaSettings } from "@/lib/callMediaSettings";
import { channelsForCall, loadIceServers, peerIdFromCallChannel } from "@/lib/webrtcIce";
import { webrtcFetch } from "@/lib/webrtcApi";
import type { CallUiPhase } from "@/lib/callState";
import type { RemoteCallPeerStream, VidehCallState } from "./videhCallTypes";

export type { VidehCallState } from "./videhCallTypes";

type Role = "caller" | "callee";
const SIGNAL_POLL_MS = 250;
const ICE_RESTART_DELAY_MS = 5000;
const DISCONNECT_GRACE_MS = 4500;
const CONNECT_STABLE_MS = 1200;

/** 0 = single shared call channel (no _peer_ suffix on server invite channel). */
const SINGLE_PEER_KEY = 0;

function upsertRemotePeer(
  map: Map<number, { streamUrl?: string; hasVideo: boolean }>,
  peerId: number,
  streamUrl: string | undefined,
  hasVideo: boolean,
) {
  const prev = map.get(peerId);
  map.set(peerId, {
    streamUrl: streamUrl ?? prev?.streamUrl,
    hasVideo: hasVideo || prev?.hasVideo || false,
  });
}

export function useVidehCall(
  baseChannel: string,
  uid: number,
  isVideo: boolean,
  remotePeerIds: number[] = [],
  sessionToken?: string | null,
  videhCallerId = 0,
): VidehCallState {
  const channels = channelsForCall(baseChannel, uid, remotePeerIds);
  const primaryChannel = channels[0] ?? "";

  const pcsRef = useRef<Map<string, any>>(new Map());
  const localStreamRef = useRef<any>(null);
  const rolesRef = useRef<Map<string, Role>>(new Map());
  const candidateCursorsRef = useRef<Map<string, number>>(new Map());
  const pollTimersRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const iceRestartTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const iceRestartInFlightRef = useRef<Set<string>>(new Set());
  const lastOfferRevisionRef = useRef<Map<string, number>>(new Map());
  const lastAnswerRevisionRef = useRef<Map<string, number>>(new Map());
  const pollBusyRef = useRef<Set<string>>(new Set());
  const connectGenRef = useRef(0);
  const mountedRef = useRef(true);
  const speakerOnRef = useRef(!isVideo ? false : true);
  const mediaReadyLatchRef = useRef(false);
  const connectedSinceRef = useRef<number | null>(null);
  const disconnectGraceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasRemoteMediaRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const [joined, setJoined] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const onHoldRef = useRef(false);
  const [speakerOn, setSpeakerOn] = useState(!isVideo ? false : true);
  const [remoteCount, setRemoteCount] = useState(0);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [localStreamUrl, setLocalStreamUrl] = useState<string | undefined>();
  const [remoteStreamUrl, setRemoteStreamUrl] = useState<string | undefined>();
  const remotePeersRef = useRef<Map<number, { streamUrl?: string; hasVideo: boolean }>>(new Map());
  const [remotePeers, setRemotePeers] = useState<RemoteCallPeerStream[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [connectionPhase, setConnectionPhase] = useState<CallUiPhase>("connecting");

  const localVideoId = `videh-local-${primaryChannel}`;
  const remoteVideoId = `videh-remote-${primaryChannel}`;

  const isBenignSignalingError = (message: string): boolean => {
    const m = message.toLowerCase();
    return (
      m.includes("called in wrong state: stable")
      || (m.includes("setremote") && m.includes("stable"))
    );
  };

  const markRemoteMedia = useCallback(() => {
    hasRemoteMediaRef.current = true;
    if (!mediaReadyLatchRef.current) {
      mediaReadyLatchRef.current = true;
      setMediaReady(true);
    }
  }, []);

  const refreshAggregate = useCallback(() => {
    const { MediaStream: NativeMediaStream } = require("react-native-webrtc");
    if (remotePeersRef.current.size === 0) {
      for (const [channel, pc] of pcsRef.current.entries()) {
        if (pc?.connectionState !== "connected") continue;
        for (const receiver of pc.getReceivers?.() ?? []) {
          const track = receiver?.track;
          if (!track || track.readyState === "ended") continue;
          if (track.kind !== "video" && track.kind !== "audio") continue;
          const stream = new NativeMediaStream([track]);
          const url = typeof stream.toURL === "function" ? stream.toURL() : undefined;
          const parsedPeer = peerIdFromCallChannel(channel, uid) || remotePeerIds[0];
          upsertRemotePeer(
            remotePeersRef.current,
            parsedPeer || SINGLE_PEER_KEY,
            url,
            track.kind === "video",
          );
          if (track.kind === "audio" || track.kind === "video") hasRemoteMediaRef.current = true;
        }
      }
    }
    const pcs = [...pcsRef.current.values()];
    const states = pcs.map((pc) => pc?.connectionState as string | undefined);
    if (!mountedRef.current) return;
    const connected = states.filter((s) => s === "connected").length;
    const failed = states.some((s) => s === "failed" || s === "closed");
    const reconnecting = states.some((s) => s === "disconnected" || s === "connecting");
    const hasMedia = hasRemoteMediaRef.current || remotePeersRef.current.size > 0;
    const now = Date.now();

    if (connected > 0 || hasMedia) {
      if (disconnectGraceTimerRef.current) {
        clearTimeout(disconnectGraceTimerRef.current);
        disconnectGraceTimerRef.current = null;
      }
      if (!connectedSinceRef.current) connectedSinceRef.current = now;
      const stableFor = now - connectedSinceRef.current;
      const showLive = mediaReadyLatchRef.current || hasMedia || stableFor >= CONNECT_STABLE_MS;
      if (showLive) {
        if (hasMedia) markRemoteMedia();
        else if (!mediaReadyLatchRef.current && stableFor >= CONNECT_STABLE_MS) {
          mediaReadyLatchRef.current = true;
          setMediaReady(true);
        }
        setJoined(true);
        setRemoteCount(Math.max(connected, hasMedia ? 1 : 0));
      } else {
        setJoined(mediaReadyLatchRef.current);
        setRemoteCount(mediaReadyLatchRef.current ? 1 : 0);
      }
    } else if (mediaReadyLatchRef.current) {
      connectedSinceRef.current = null;
      if (!disconnectGraceTimerRef.current) {
        disconnectGraceTimerRef.current = setTimeout(() => {
          disconnectGraceTimerRef.current = null;
          if (!mountedRef.current) return;
          mediaReadyLatchRef.current = false;
          hasRemoteMediaRef.current = false;
          setMediaReady(false);
          setJoined(false);
          setRemoteCount(0);
        }, DISCONNECT_GRACE_MS);
      }
    } else {
      connectedSinceRef.current = null;
      setJoined(false);
      setRemoteCount(0);
    }
    const peerList: RemoteCallPeerStream[] = [...remotePeersRef.current.entries()].map(([peerId, p]) => ({
      peerId,
      streamUrl: p.streamUrl,
      hasVideo: p.hasVideo,
    }));
    setRemotePeers(peerList);
    const withStream = peerList.filter((p) => p.streamUrl);
    const pick = withStream.find((p) => p.hasVideo) ?? withStream[0] ?? peerList[0];
    if (pick) {
      setRemoteStreamUrl(pick.streamUrl);
      setHasRemoteVideo(peerList.some((p) => p.hasVideo));
    }
    if (connected > 0) {
      setError(null);
      setConnectionPhase("connected");
      if (!isVideo) setProximityScreenOff(true);
    } else if (failed) {
      setConnectionPhase("failed");
    } else if (reconnecting && pcs.length > 0) {
      setConnectionPhase(mediaReadyLatchRef.current ? "reconnecting" : "connecting");
    } else if (pcs.length > 0) {
      setConnectionPhase("connecting");
    }
  }, [isVideo, uid, remotePeerIds, markRemoteMedia]);

  const channelsKey = channels.join("|");

  const stopAllSignaling = useCallback(() => {
    for (const timer of pollTimersRef.current.values()) clearInterval(timer);
    pollTimersRef.current.clear();
    pollBusyRef.current.clear();
    for (const timer of iceRestartTimersRef.current.values()) clearTimeout(timer);
    iceRestartTimersRef.current.clear();
    iceRestartInFlightRef.current.clear();
  }, []);

  const closeAllPeerConnections = useCallback(
    (deleteSessions: boolean) => {
      const channelList = [...pcsRef.current.keys()];
      for (const channel of channelList) {
        pcsRef.current.get(channel)?.close?.();
        if (deleteSessions) {
          webrtcFetch(`/sessions/${encodeURIComponent(channel)}`, sessionToken, { method: "DELETE" }).catch(() => {});
        }
      }
      pcsRef.current.clear();
      rolesRef.current.clear();
      candidateCursorsRef.current.clear();
      remotePeersRef.current.clear();
      lastOfferRevisionRef.current.clear();
      lastAnswerRevisionRef.current.clear();
      if (disconnectGraceTimerRef.current) {
        clearTimeout(disconnectGraceTimerRef.current);
        disconnectGraceTimerRef.current = null;
      }
      mediaReadyLatchRef.current = false;
      hasRemoteMediaRef.current = false;
      connectedSinceRef.current = null;
      setJoined(false);
      setMediaReady(false);
      setRemoteCount(0);
      setRemotePeers([]);
      setRemoteStreamUrl(undefined);
      setHasRemoteVideo(false);
      setConnectionPhase("connecting");
    },
    [sessionToken],
  );

  useEffect(() => {
    if (!primaryChannel || !uid) return;

    const connectGen = ++connectGenRef.current;
    let stopped = false;
    let localStream: any = null;

    const postJson = async (path: string, body: unknown) => {
      await webrtcFetch(path, sessionToken, { method: "POST", body: JSON.stringify(body) });
    };

    const shouldInitiateIceRestart = (channel: string): boolean => {
      const peerId = peerIdFromCallChannel(channel, uid) || remotePeerIds[0];
      if (!peerId || peerId === uid) return true;
      return uid < peerId;
    };

    const scheduleIceRestart = (channel: string, pc: any, role: Role) => {
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
            const { RTCSessionDescription } = require("react-native-webrtc");
            if (typeof pcNow.restartIce === "function") {
              pcNow.restartIce();
            }
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
            if (role === "caller") {
              lastAnswerRevisionRef.current.delete(channel);
            }
          } catch {
            /* retry on next disconnect */
          } finally {
            iceRestartInFlightRef.current.delete(channel);
          }
        })();
      }, ICE_RESTART_DELAY_MS);
      iceRestartTimersRef.current.set(channel, timer);
    };

    const connectChannel = async (channel: string, sharedLocalStream: any, iceServers: RTCIceServer[]) => {
      if (connectGen !== connectGenRef.current || stopped) return;
      if (pcsRef.current.has(channel)) {
        const existingTimer = pollTimersRef.current.get(channel);
        if (existingTimer) return;
        pcsRef.current.get(channel)?.close?.();
        pcsRef.current.delete(channel);
      }
      const {
        RTCPeerConnection,
        RTCSessionDescription,
        RTCIceCandidate,
      } = require("react-native-webrtc");

      const sessionRes = await webrtcFetch("/sessions", sessionToken, {
        method: "POST",
        body: JSON.stringify({
          channel,
          userId: uid,
          type: isVideo ? "video" : "audio",
          videhCallerId: videhCallerId || uid,
        }),
      });
      const sessionData = await sessionRes.json() as { success?: boolean; role?: Role };
      if (connectGen !== connectGenRef.current || stopped) return;
      if (!sessionData.success || !sessionData.role) throw new Error("Could not start call signaling.");
      const role = sessionData.role;
      rolesRef.current.set(channel, role);
      candidateCursorsRef.current.set(channel, 0);

      const pc = new RTCPeerConnection({ iceServers });
      pcsRef.current.set(channel, pc);
      sharedLocalStream.getTracks().forEach((track: any) => pc.addTrack(track, sharedLocalStream));

      pc.onicecandidate = (event: any) => {
        if (event.candidate) {
          const candidate = typeof event.candidate.toJSON === "function" ? event.candidate.toJSON() : event.candidate;
          void postJson(`/sessions/${encodeURIComponent(channel)}/candidates`, { role, candidate });
        }
      };
      const noteRemoteStream = (stream: any) => {
        if (!stream) return;
        const url = typeof stream.toURL === "function" ? stream.toURL() : undefined;
        const hasVid = (stream.getVideoTracks?.().length ?? 0) > 0;
        const hasAud = (stream.getAudioTracks?.().length ?? 0) > 0;
        const parsedPeer = peerIdFromCallChannel(channel, uid) || remotePeerIds[0];
        const storageKey = parsedPeer || SINGLE_PEER_KEY;
        upsertRemotePeer(remotePeersRef.current, storageKey, url, hasVid);
        if (hasAud || hasVid) markRemoteMedia();
        refreshAggregate();
      };
      pc.ontrack = (event: any) => {
        const { MediaStream: NativeMediaStream } = require("react-native-webrtc");
        const stream =
          event.streams?.[0]
          ?? event.stream
          ?? (event.track ? new NativeMediaStream([event.track]) : null);
        noteRemoteStream(stream);
      };
      pc.onaddstream = (event: any) => {
        noteRemoteStream(event.stream);
      };
      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === "connected") {
          const t = iceRestartTimersRef.current.get(channel);
          if (t) {
            clearTimeout(t);
            iceRestartTimersRef.current.delete(channel);
          }
          setError(null);
        } else if (state === "disconnected") {
          scheduleIceRestart(channel, pc, role);
        } else if (state === "failed") {
          const t = iceRestartTimersRef.current.get(channel);
          if (t) {
            clearTimeout(t);
            iceRestartTimersRef.current.delete(channel);
          }
          scheduleIceRestart(channel, pc, role);
        }
        refreshAggregate();
      };

      if (role === "caller") {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await postJson(`/sessions/${encodeURIComponent(channel)}/offer`, { offer });
      }

      if (connectGen !== connectGenRef.current || stopped) {
        pc.close?.();
        return;
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
            if (
              activeRole === "callee"
              && session.session?.offer
              && offerRevision > seenOfferRev
            ) {
              lastOfferRevisionRef.current.set(channel, offerRevision);
              await pcNow.setRemoteDescription(new RTCSessionDescription(session.session.offer));
              const answer = await pcNow.createAnswer();
              await pcNow.setLocalDescription(answer);
              await postJson(`/sessions/${encodeURIComponent(channel)}/answer`, { answer });
            }
            const answerRevision = session.session?.answerRevision ?? 0;
            const seenAnswerRev = lastAnswerRevisionRef.current.get(channel) ?? -1;
            if (
              activeRole === "caller"
              && session.session?.answer
              && answerRevision > seenAnswerRev
            ) {
              lastAnswerRevisionRef.current.set(channel, answerRevision);
              const sig = pcNow.signalingState;
              if (sig === "have-local-offer" || sig === "stable") {
                await pcNow.setRemoteDescription(new RTCSessionDescription(session.session.answer));
              }
            }

            const since = candidateCursorsRef.current.get(channel) ?? 0;
            const candidateRes = await webrtcFetch(
              `/sessions/${encodeURIComponent(channel)}/candidates?role=${activeRole}&since=${since}`,
              sessionToken,
            ).then((r) => r.json()) as { candidates?: RTCIceCandidateInit[]; next?: number };
            for (const candidate of candidateRes.candidates ?? []) {
              await pcNow.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
            }
            candidateCursorsRef.current.set(channel, candidateRes.next ?? since);
          } catch (e: any) {
            if (stopped) return;
            const msg = e?.message ?? "Call signaling error";
            const pcNow = pcsRef.current.get(channel);
            const connected = pcNow?.connectionState === "connected";
            if (connected || isBenignSignalingError(msg)) return;
            setError(msg);
            const t = pollTimersRef.current.get(channel);
            if (t) {
              clearInterval(t);
              pollTimersRef.current.delete(channel);
            }
          } finally {
            pollBusyRef.current.delete(channel);
          }
        })();
      }, SIGNAL_POLL_MS);
      pollTimersRef.current.set(channel, pollTimer);
    };

    const ensureLocalStream = async () => {
      if (localStreamRef.current) return localStreamRef.current;
      if (Platform.OS === "android") {
        const perms: string[] = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
        if (isVideo) perms.push(PermissionsAndroid.PERMISSIONS.CAMERA);
        const results = await PermissionsAndroid.requestMultiple(perms as any);
        const denied = Object.values(results).some((v) => v !== PermissionsAndroid.RESULTS.GRANTED);
        if (denied) throw new Error("Microphone/camera permission denied");
      }
      await startInCallSession(isVideo);
      applySpeakerRoute(speakerOnRef.current, isVideo);
      const { mediaDevices } = require("react-native-webrtc");
      const lowData = (await getCallMediaSettings()).lowDataMode;
      const stream = await mediaDevices.getUserMedia(buildCallMediaConstraints(isVideo, lowData));
      localStreamRef.current = stream;
      setLocalStreamUrl(typeof stream.toURL === "function" ? stream.toURL() : undefined);
      return stream;
    };

    const syncChannels = async () => {
      try {
        localStream = await ensureLocalStream();
        if (connectGen !== connectGenRef.current || stopped) return;
        const iceServers = await loadIceServers(sessionToken);
        for (const channel of channels) {
          if (stopped || connectGen !== connectGenRef.current) return;
          await connectChannel(channel, localStream, iceServers);
        }
        const active = new Set(channels);
        for (const [channel, timer] of pollTimersRef.current.entries()) {
          if (!active.has(channel)) {
            clearInterval(timer);
            pollTimersRef.current.delete(channel);
            pcsRef.current.get(channel)?.close?.();
            pcsRef.current.delete(channel);
            webrtcFetch(`/sessions/${encodeURIComponent(channel)}`, sessionToken, { method: "DELETE" }).catch(() => {});
          }
        }
        refreshAggregate();
      } catch (e: any) {
        const msg = e?.message ?? "";
        if (msg.includes("Cannot find module") || msg.includes("TurboModuleRegistry") || msg.includes("NativeModules")) {
          setError("NATIVE_WEBRTC_UNAVAILABLE");
        } else {
          setError(msg || "Failed to start native self-hosted call.");
        }
      }
    };

    void syncChannels();

    return () => {
      stopped = true;
      stopAllSignaling();
      closeAllPeerConnections(true);
    };
  }, [primaryChannel, uid, isVideo, channelsKey, refreshAggregate, sessionToken, remotePeerIds, videhCallerId, stopAllSignaling, closeAllPeerConnections]);

  useEffect(() => {
    return () => {
      setProximityScreenOff(false);
      void stopInCallSession();
      stopAllSignaling();
      closeAllPeerConnections(true);
      localStreamRef.current?.getTracks?.().forEach((track: any) => track.stop());
      localStreamRef.current = null;
    };
  }, [primaryChannel, uid, stopAllSignaling, closeAllPeerConnections]);

  return {
    joined,
    mediaReady,
    connectionPhase,
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
    remotePeers,
    toggleMute: () => {
      setMuted((m) => {
        const next = !m;
        localStreamRef.current?.getAudioTracks?.().forEach((track: any) => {
          track.enabled = !next && !onHoldRef.current;
        });
        return next;
      });
    },
    toggleCamera: () => {
      localStreamRef.current?.getVideoTracks?.().forEach((track: any) => { track.enabled = cameraOff; });
      setCameraOff((c) => !c);
    },
    toggleSpeaker: () => {
      setSpeakerOn((prev) => {
        const next = !prev;
        speakerOnRef.current = next;
        applySpeakerRoute(next, isVideo);
        return next;
      });
    },
    setSpeaker: (enabled: boolean) => {
      speakerOnRef.current = enabled;
      setSpeakerOn(enabled);
      applySpeakerRoute(enabled, isVideo);
    },
    setHeld: (held: boolean) => {
      onHoldRef.current = held;
      localStreamRef.current?.getAudioTracks?.().forEach((track: any) => {
        track.enabled = !held && !muted;
      });
      for (const pc of pcsRef.current.values()) {
        try {
          pc.getReceivers?.().forEach((r: any) => {
            if (r.track?.kind === "audio") r.track.enabled = !held;
          });
        } catch { /* ignore */ }
      }
    },
    shareScreen: async () => false,
    stopScreenShare: async () => {},
    leave: async () => {
      setProximityScreenOff(false);
      stopAllSignaling();
      closeAllPeerConnections(true);
      await stopInCallSession();
      localStreamRef.current?.getTracks?.().forEach((track: any) => track.stop());
      localStreamRef.current = null;
      setLocalStreamUrl(undefined);
      if (disconnectGraceTimerRef.current) {
        clearTimeout(disconnectGraceTimerRef.current);
        disconnectGraceTimerRef.current = null;
      }
      mediaReadyLatchRef.current = false;
      hasRemoteMediaRef.current = false;
      connectedSinceRef.current = null;
      setJoined(false);
      setMediaReady(false);
      setRemoteCount(0);
      setRemotePeers([]);
      setRemoteStreamUrl(undefined);
      setHasRemoteVideo(false);
      setConnectionPhase("connecting");
      setError(null);
    },
  };
}

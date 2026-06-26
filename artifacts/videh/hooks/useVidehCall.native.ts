import { useCallback, useEffect, useRef, useState } from "react";
import { PermissionsAndroid, Platform } from "react-native";
import { applySpeakerRoute, setProximityScreenOff, startInCallSession, stopInCallSession } from "@/lib/inCallAudio";
import { buildCallMediaConstraints, getCallMediaSettings, type CameraFacing } from "@/lib/callMediaSettings";
import { startScreenShare, stopScreenShare as stopScreenShareTracks } from "@/lib/screenShare";
import { channelsForCall, loadIceServers, peerIdFromCallChannel } from "@/lib/webrtcIce";
import { webrtcFetch } from "@/lib/webrtcApi";
import { normalizeCallNetworkError } from "@/lib/videhCall/signalingClient";
import { callDebug } from "@/lib/callDebug";
import type { CallUiPhase } from "@/lib/callState";
import type { RemoteCallPeerStream, VidehCallState } from "./videhCallTypes";

export type { VidehCallState } from "./videhCallTypes";

type Role = "caller" | "callee";
/** Fast poll while the call is still negotiating (offer/answer/ICE exchange). */
const SIGNAL_POLL_MS = 120;
/** Slow poll once connected — only needed to catch ICE restarts / renegotiation. */
const SIGNAL_POLL_CONNECTED_MS = 1200;
const ICE_RESTART_DELAY_MS = 5000;
const DISCONNECT_GRACE_MS = 4500;
const CONNECT_STABLE_MS = 200;

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
  callId: string | null = null,
  negotiateBump = 0,
): VidehCallState {
  const channels = channelsForCall(baseChannel, uid, remotePeerIds);
  const primaryChannel = channels[0] ?? "";

  const pcsRef = useRef<Map<string, any>>(new Map());
  const localStreamRef = useRef<any>(null);
  const rolesRef = useRef<Map<string, Role>>(new Map());
  const candidateCursorsRef = useRef<Map<string, number>>(new Map());
  const pollTimersRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const pollRatesRef = useRef<Map<string, number>>(new Map());
  const iceRestartTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const iceRestartInFlightRef = useRef<Set<string>>(new Set());
  const lastOfferRevisionRef = useRef<Map<string, number>>(new Map());
  const lastAnswerRevisionRef = useRef<Map<string, number>>(new Map());
  const pollBusyRef = useRef<Set<string>>(new Set());
  const pollFailCountsRef = useRef<Map<string, number>>(new Map());
  const offerProcessingRef = useRef<Set<string>>(new Set());
  const connectedNotifiedRef = useRef(false);
  const callIdRef = useRef(callId);
  callIdRef.current = callId;
  const connectGenRef = useRef(0);
  const mountedRef = useRef(true);
  const speakerOnRef = useRef(!isVideo ? false : true);
  const mediaReadyLatchRef = useRef(false);
  const facingModeRef = useRef<CameraFacing>("user");
  const screenSharingRef = useRef(false);
  const cameraVideoTrackRef = useRef<any>(null);
  const connectedSinceRef = useRef<number | null>(null);
  const disconnectGraceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasRemoteMediaRef = useRef(false);
  const remotePeerIdsRef = useRef(remotePeerIds);
  remotePeerIdsRef.current = remotePeerIds;

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
  const [isFrontCamera, setIsFrontCamera] = useState(true);
  const [localVideoRevision, setLocalVideoRevision] = useState(0);
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
          const parsedPeer = peerIdFromCallChannel(channel, uid) || remotePeerIdsRef.current[0];
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
    const stableFor = connectedSinceRef.current ? now - connectedSinceRef.current : 0;

    if (connected > 0 || hasMedia) {
      if (disconnectGraceTimerRef.current) {
        clearTimeout(disconnectGraceTimerRef.current);
        disconnectGraceTimerRef.current = null;
      }
      if (!connectedSinceRef.current) connectedSinceRef.current = now;
      const liveStableFor = now - connectedSinceRef.current;
      const showLive = mediaReadyLatchRef.current || hasMedia || liveStableFor >= CONNECT_STABLE_MS;
      if (showLive) {
        if (hasMedia) markRemoteMedia();
        else if (!mediaReadyLatchRef.current && liveStableFor >= CONNECT_STABLE_MS) {
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
    const mediaConnected = hasMedia || mediaReadyLatchRef.current;
    if (connected > 0 || mediaConnected) {
      setError(null);
      const readyToShow = connected > 0 || hasMedia || (mediaConnected && stableFor >= CONNECT_STABLE_MS);
      if (readyToShow) {
        setConnectionPhase("connected");
        if (!isVideo) setProximityScreenOff(true);
      }
      if (readyToShow && !connectedNotifiedRef.current && callIdRef.current && sessionToken) {
        connectedNotifiedRef.current = true;
        callDebug("PEER_CONNECTION_CONNECTED", { channel: primaryChannel, callId: callIdRef.current, viaMedia: mediaConnected && connected === 0 });
        void webrtcFetch(`/calls/${callIdRef.current}/connected`, sessionToken, {
          method: "POST",
          body: JSON.stringify({ userId: uid }),
        }).catch(() => {});
      }
    } else if (failed) {
      setConnectionPhase("failed");
    } else if (reconnecting && pcs.length > 0) {
      setConnectionPhase(mediaReadyLatchRef.current ? "reconnecting" : "connecting");
    } else if (pcs.length > 0) {
      setConnectionPhase("connecting");
    }
  }, [isVideo, uid, markRemoteMedia]);

  const channelsKey = channels.join("|");

  const stopAllSignaling = useCallback(() => {
    for (const timer of pollTimersRef.current.values()) clearInterval(timer);
    pollTimersRef.current.clear();
    pollRatesRef.current.clear();
    pollBusyRef.current.clear();
    pollFailCountsRef.current.clear();
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
      offerProcessingRef.current.clear();
      connectedNotifiedRef.current = false;
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
    if (!primaryChannel || !uid || videhCallerId <= 0) {
      return () => {
        stopAllSignaling();
        closeAllPeerConnections(false);
      };
    }

    const connectGen = ++connectGenRef.current;
    let stopped = false;
    let localStream: any = null;
    stopAllSignaling();
    closeAllPeerConnections(false);

    const postJson = async (path: string, body: unknown) => {
      await webrtcFetch(path, sessionToken, { method: "POST", body: JSON.stringify(body) });
    };

    const shouldInitiateIceRestart = (channel: string): boolean => {
      const peerId = peerIdFromCallChannel(channel, uid) || remotePeerIdsRef.current[0];
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
        const existing = pcsRef.current.get(channel);
        const existingTimer = pollTimersRef.current.get(channel);
        const state = existing?.connectionState as string | undefined;
        const alive = existing && state !== "closed" && state !== "failed";
        if (existingTimer && alive) return;
        existing?.close?.();
        pcsRef.current.delete(channel);
        if (existingTimer) {
          clearInterval(existingTimer);
          pollTimersRef.current.delete(channel);
          pollRatesRef.current.delete(channel);
        }
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

      callDebug("CREATING_PEER_CONNECTION", { channel, role, uid, videhCallerId, callId: callIdRef.current });

      const pc = new RTCPeerConnection({ iceServers });
      pcsRef.current.set(channel, pc);
      sharedLocalStream.getTracks().forEach((track: any) => pc.addTrack(track, sharedLocalStream));

      function pollSignalOnce(pollChannel: string) {
        if (pollBusyRef.current.has(pollChannel)) return;
        pollBusyRef.current.add(pollChannel);
        void (async () => {
          try {
            const pcNow = pcsRef.current.get(pollChannel);
            if (stopped || !pcNow) return;
            const activeRole = rolesRef.current.get(pollChannel) ?? role;
            const sessionRes = await webrtcFetch(
              `/sessions/${encodeURIComponent(pollChannel)}?_=${Date.now()}`,
              sessionToken,
            );
            if (sessionRes.status === 304 || sessionRes.status === 204) {
              callDebug("SESSION_POLL_NOT_MODIFIED", { channel: pollChannel, status: sessionRes.status, role: activeRole });
            } else if (!sessionRes.ok) {
              throw new Error(`Session poll failed (${sessionRes.status})`);
            } else {
            const session = await sessionRes.json() as {
              session?: {
                offer?: RTCSessionDescriptionInit | null;
                answer?: RTCSessionDescriptionInit | null;
                offerRevision?: number;
                answerRevision?: number;
              };
            };
            const offerRevision = session.session?.offerRevision ?? 0;
            const seenOfferRev = lastOfferRevisionRef.current.get(pollChannel) ?? -1;
            const hasOffer = Boolean(session.session?.offer);
            callDebug("SESSION_POLL", {
              channel: pollChannel,
              activeRole,
              offerRevision,
              seenOfferRev,
              hasOffer,
              willProcessOffer: activeRole === "callee" && hasOffer && offerRevision > seenOfferRev,
              signalingState: pcNow.signalingState,
            });
            if (activeRole === "callee" && hasOffer && offerRevision <= seenOfferRev) {
              callDebug("OFFER_ALREADY_SEEN", { channel: pollChannel, offerRevision, seenOfferRev });
            }
            if (
              activeRole === "callee"
              && hasOffer
              && offerRevision > seenOfferRev
              && !offerProcessingRef.current.has(pollChannel)
            ) {
              offerProcessingRef.current.add(pollChannel);
              try {
                callDebug("RECEIVING_OFFER", { channel: pollChannel, offerRevision, role: activeRole });
                callDebug("SETTING_REMOTE_DESCRIPTION", { channel: pollChannel, type: "offer", role: activeRole });
                try {
                  await pcNow.setRemoteDescription(new RTCSessionDescription(session.session!.offer!));
                } catch (e: any) {
                  callDebug("SET_REMOTE_DESCRIPTION_FAILED", {
                    channel: pollChannel,
                    role: activeRole,
                    message: e?.message ?? String(e),
                  });
                  throw e;
                }
                callDebug("CREATING_ANSWER", { channel: pollChannel, role: activeRole });
                let answer: RTCSessionDescriptionInit;
                try {
                  answer = await pcNow.createAnswer();
                  await pcNow.setLocalDescription(answer);
                } catch (e: any) {
                  callDebug("CREATE_ANSWER_FAILED", {
                    channel: pollChannel,
                    role: activeRole,
                    message: e?.message ?? String(e),
                  });
                  throw e;
                }
                callDebug("SENDING_ANSWER", {
                  channel: pollChannel,
                  answerRevision: (session.session?.answerRevision ?? 0) + 1,
                  role: activeRole,
                });
                try {
                  await postJson(`/sessions/${encodeURIComponent(pollChannel)}/answer`, { answer });
                } catch (e: any) {
                  callDebug("SEND_ANSWER_FAILED", {
                    channel: pollChannel,
                    role: activeRole,
                    message: e?.message ?? String(e),
                  });
                  throw e;
                }
                lastOfferRevisionRef.current.set(pollChannel, offerRevision);
                callDebug("ANSWER_SENT", { channel: pollChannel, role: activeRole, offerRevision });
                pollSignalOnce(pollChannel);
              } finally {
                offerProcessingRef.current.delete(pollChannel);
              }
            } else if (activeRole === "callee" && !hasOffer) {
              callDebug("CALLEE_WAITING_FOR_OFFER", { channel: pollChannel, role: activeRole });
            } else if (activeRole !== "callee" && hasOffer) {
              callDebug("OFFER_IGNORED_NOT_CALLEE", { channel: pollChannel, activeRole });
            }
            const answerRevision = session.session?.answerRevision ?? 0;
            const seenAnswerRev = lastAnswerRevisionRef.current.get(pollChannel) ?? -1;
            if (
              activeRole === "caller"
              && session.session?.answer
              && answerRevision > seenAnswerRev
            ) {
              callDebug("RECEIVING_ANSWER", { channel: pollChannel, answerRevision, role: activeRole });
              lastAnswerRevisionRef.current.set(pollChannel, answerRevision);
              const sig = pcNow.signalingState;
              if (sig === "have-local-offer" || sig === "stable") {
                await pcNow.setRemoteDescription(new RTCSessionDescription(session.session.answer));
              }
            }
            }

            const since = candidateCursorsRef.current.get(pollChannel) ?? 0;
            const candidateResRaw = await webrtcFetch(
              `/sessions/${encodeURIComponent(pollChannel)}/candidates?role=${activeRole}&since=${since}&_=${Date.now()}`,
              sessionToken,
            );
            if (candidateResRaw.ok && candidateResRaw.status !== 304) {
              const candidateRes = await candidateResRaw.json() as { candidates?: RTCIceCandidateInit[]; next?: number };
              for (const candidate of candidateRes.candidates ?? []) {
                callDebug("ICE_CANDIDATE_RECEIVED", { channel: pollChannel, role: activeRole });
                await pcNow.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
              }
              candidateCursorsRef.current.set(pollChannel, candidateRes.next ?? since);
            }
            // Successful poll — reset failure streak and clear any transient error banner.
            if ((pollFailCountsRef.current.get(pollChannel) ?? 0) > 0) {
              pollFailCountsRef.current.set(pollChannel, 0);
              setError((prev) => (prev && prev !== "NATIVE_WEBRTC_UNAVAILABLE" ? null : prev));
            }
          } catch (e: any) {
            if (stopped) return;
            const msg = e?.message ?? "Call signaling error";
            const pcNow = pcsRef.current.get(pollChannel);
            const connected = pcNow?.connectionState === "connected";
            if (connected || isBenignSignalingError(msg)) return;
            const fails = (pollFailCountsRef.current.get(pollChannel) ?? 0) + 1;
            pollFailCountsRef.current.set(pollChannel, fails);
            callDebug("SIGNAL_POLL_ERROR", { channel: pollChannel, role: rolesRef.current.get(pollChannel), message: msg, fails });
            // Only surface a hard error after several consecutive failures so a single
            // network blip during connection setup does not flash a scary banner.
            if (fails >= 6) setError(normalizeCallNetworkError(e).message);
          } finally {
            pollBusyRef.current.delete(pollChannel);
          }
        })();
      }

      function schedulePoll(pollChannel: string, intervalMs: number) {
        if (stopped || connectGen !== connectGenRef.current) return;
        if (pollRatesRef.current.get(pollChannel) === intervalMs && pollTimersRef.current.has(pollChannel)) {
          return;
        }
        const existing = pollTimersRef.current.get(pollChannel);
        if (existing) clearInterval(existing);
        pollRatesRef.current.set(pollChannel, intervalMs);
        const timer = setInterval(() => pollSignalOnce(pollChannel), intervalMs);
        pollTimersRef.current.set(pollChannel, timer);
      }

      pc.onicecandidate = (event: any) => {
        if (event.candidate) {
          const candidate = typeof event.candidate.toJSON === "function" ? event.candidate.toJSON() : event.candidate;
          void postJson(`/sessions/${encodeURIComponent(channel)}/candidates`, { role, candidate }).then(() => {
            callDebug("ICE_CANDIDATE_SENT", { channel, role });
            pollSignalOnce(channel);
          });
        }
      };
      const noteRemoteStream = (stream: any) => {
        if (!stream) return;
        const url = typeof stream.toURL === "function" ? stream.toURL() : undefined;
        const hasVid = (stream.getVideoTracks?.().length ?? 0) > 0;
        const hasAud = (stream.getAudioTracks?.().length ?? 0) > 0;
        const parsedPeer = peerIdFromCallChannel(channel, uid) || remotePeerIdsRef.current[0];
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
          callDebug("PEER_CONNECTION_CONNECTED", { channel, role, uid });
          const t = iceRestartTimersRef.current.get(channel);
          if (t) {
            clearTimeout(t);
            iceRestartTimersRef.current.delete(channel);
          }
          setError(null);
          schedulePoll(channel, SIGNAL_POLL_CONNECTED_MS);
        } else if (state === "failed") {
          const t = iceRestartTimersRef.current.get(channel);
          if (t) {
            clearTimeout(t);
            iceRestartTimersRef.current.delete(channel);
          }
          schedulePoll(channel, SIGNAL_POLL_MS);
          scheduleIceRestart(channel, pc, role);
        } else if (state === "disconnected" || state === "connecting") {
          schedulePoll(channel, SIGNAL_POLL_MS);
        }
        refreshAggregate();
      };

      if (role === "caller") {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        callDebug("SENDING_OFFER", { channel, role });
        await postJson(`/sessions/${encodeURIComponent(channel)}/offer`, { offer });
        pollSignalOnce(channel);
      }

      if (connectGen !== connectGenRef.current || stopped) {
        pc.close?.();
        return;
      }

      schedulePoll(channel, SIGNAL_POLL_MS);
      pollSignalOnce(channel);
    };

    const ensureLocalStream = async () => {
      const existing = localStreamRef.current;
      if (existing) {
        const hasVideo = (existing.getVideoTracks?.().length ?? 0) > 0;
        if (!isVideo || hasVideo) return existing;
        existing.getTracks?.().forEach((track: any) => track.stop());
        localStreamRef.current = null;
        setLocalStreamUrl(undefined);
      }
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
      const stream = await mediaDevices.getUserMedia(
        buildCallMediaConstraints(isVideo, lowData, facingModeRef.current),
      );
      localStreamRef.current = stream;
      const videoTrack = stream.getVideoTracks?.()[0];
      if (videoTrack) cameraVideoTrackRef.current = videoTrack;
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
            pollRatesRef.current.delete(channel);
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
          setError(normalizeCallNetworkError(e).message || "Failed to start native self-hosted call.");
        }
      }
    };

    void syncChannels();

    return () => {
      stopped = true;
      stopAllSignaling();
      closeAllPeerConnections(false);
      localStreamRef.current?.getTracks?.().forEach((track: any) => track.stop());
      localStreamRef.current = null;
      setLocalStreamUrl(undefined);
      void stopInCallSession();
    };
  }, [primaryChannel, uid, isVideo, channelsKey, sessionToken, videhCallerId, callId, negotiateBump, stopAllSignaling, closeAllPeerConnections]);

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
    flipCamera: async () => {
      const track = localStreamRef.current?.getVideoTracks?.()[0];
      if (!track || track.remote) return;
      const nextFacing: CameraFacing = facingModeRef.current === "user" ? "environment" : "user";
      const applyFacing = async (facing: CameraFacing) => {
        const lowData = (await getCallMediaSettings()).lowDataMode;
        const { video } = buildCallMediaConstraints(isVideo, lowData, facing);
        if (video && typeof video === "object") {
          await track.applyConstraints(video);
        } else {
          await track.applyConstraints({ facingMode: facing });
        }
        const settings = track.getSettings?.() ?? {};
        const resolved: CameraFacing =
          settings.facingMode === "environment" ? "environment" : "user";
        facingModeRef.current = resolved;
        setIsFrontCamera(resolved === "user");
        setLocalStreamUrl(
          typeof localStreamRef.current?.toURL === "function"
            ? localStreamRef.current.toURL()
            : undefined,
        );
        setLocalVideoRevision((v) => v + 1);
      };
      try {
        await applyFacing(nextFacing);
        return;
      } catch {
        /* applyConstraints failed — replace track */
      }
      try {
        const { mediaDevices } = require("react-native-webrtc");
        const lowData = (await getCallMediaSettings()).lowDataMode;
        const fresh = await mediaDevices.getUserMedia(buildCallMediaConstraints(isVideo, lowData, nextFacing));
        const newTrack = fresh.getVideoTracks?.()[0];
        if (!newTrack) {
          fresh.getTracks?.().forEach((t: any) => t.stop());
          return;
        }
        track.stop?.();
        const stream = localStreamRef.current;
        if (stream?.removeTrack && stream?.addTrack) {
          stream.removeTrack(track);
          stream.addTrack(newTrack);
        } else {
          localStreamRef.current = fresh;
        }
        cameraVideoTrackRef.current = newTrack;
        facingModeRef.current = nextFacing;
        setIsFrontCamera(nextFacing === "user");
        setLocalStreamUrl(
          typeof localStreamRef.current?.toURL === "function"
            ? localStreamRef.current.toURL()
            : undefined,
        );
        setLocalVideoRevision((v) => v + 1);
        for (const pc of pcsRef.current.values()) {
          const sender = pc.getSenders?.().find((s: any) => s.track?.kind === "video");
          if (sender) await sender.replaceTrack(newTrack);
        }
      } catch {
        /* ignore flip failure */
      }
    },
    isFrontCamera,
    localVideoRevision,
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
    shareScreen: async () => {
      const screenStream = await startScreenShare();
      const screenTrack = screenStream?.getVideoTracks?.()[0];
      if (!screenTrack) return false;
      screenSharingRef.current = true;
      const cam = cameraVideoTrackRef.current
        ?? localStreamRef.current?.getVideoTracks?.()[0];
      if (cam && !cameraVideoTrackRef.current) cameraVideoTrackRef.current = cam;
      for (const pc of pcsRef.current.values()) {
        const sender = pc.getSenders?.().find((s: any) => s.track?.kind === "video");
        if (sender) await sender.replaceTrack(screenTrack);
      }
      if (typeof screenStream?.toURL === "function") {
        setLocalStreamUrl(screenStream.toURL());
      }
      screenTrack.onended = () => {
        void (async () => {
          await stopScreenShareTracks();
          screenSharingRef.current = false;
          const restore = cameraVideoTrackRef.current;
          if (!restore) return;
          for (const pc of pcsRef.current.values()) {
            const sender = pc.getSenders?.().find((s: any) => s.track?.kind === "video");
            if (sender) await sender.replaceTrack(restore);
          }
          if (localStreamRef.current && typeof localStreamRef.current.toURL === "function") {
            setLocalStreamUrl(localStreamRef.current.toURL());
          }
        })();
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
        const sender = pc.getSenders?.().find((s: any) => s.track?.kind === "video");
        if (sender) await sender.replaceTrack(cam);
      }
      if (localStreamRef.current && typeof localStreamRef.current.toURL === "function") {
        setLocalStreamUrl(localStreamRef.current.toURL());
      }
    },
    leave: async () => {
      connectGenRef.current += 1;
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

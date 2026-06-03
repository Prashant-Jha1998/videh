import { useCallback, useEffect, useRef, useState } from "react";
import { PermissionsAndroid, Platform } from "react-native";
import { applySpeakerRoute, setProximityScreenOff, startInCallSession, stopInCallSession } from "@/lib/inCallAudio";
import { buildCallMediaConstraints, getCallMediaSettings } from "@/lib/callMediaSettings";
import { ICE_RESTART_AFTER_MS } from "@/lib/callStability";
import { connectMeshPeersStaggered } from "@/lib/meshPeerConnect";
import { channelsForCall, peerIdFromCallChannel } from "@/lib/webrtcIce";
import { buildRtcConfiguration } from "@/lib/webrtcRtcConfig";
import { webrtcFetch } from "@/lib/webrtcApi";
import type { CallUiPhase } from "@/lib/callState";
import type { RemoteCallPeerStream, VidehCallState } from "./videhCallTypes";

export type { VidehCallState } from "./videhCallTypes";

type Role = "caller" | "callee";
const SIGNAL_POLL_MS = 250;

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
): VidehCallState {
  const channels = channelsForCall(baseChannel, uid, remotePeerIds);
  const primaryChannel = channels[0] ?? "";

  const pcsRef = useRef<Map<string, any>>(new Map());
  const localStreamRef = useRef<any>(null);
  const rolesRef = useRef<Map<string, Role>>(new Map());
  const candidateCursorsRef = useRef<Map<string, number>>(new Map());
  const pollTimersRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const speakerOnRef = useRef(!isVideo ? false : true);

  const [joined, setJoined] = useState(false);
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
      || m.includes("called in wrong state: closed")
      || m.includes("signalingstate is closed")
      || m.includes("peerconnection not found")
      || m.includes("call session not found")
    );
  };

  const pruneStalePeers = useCallback(() => {
    const livePeerIds = new Set<number>();
    for (const [channel, pc] of pcsRef.current.entries()) {
      if (pc?.connectionState !== "connected" && pc?.connectionState !== "connecting") continue;
      const parsed = peerIdFromCallChannel(channel, uid) || remotePeerIds[0];
      if (parsed) livePeerIds.add(parsed);
      else if (!channel.includes("_peer_")) livePeerIds.add(SINGLE_PEER_KEY);
    }
    for (const key of [...remotePeersRef.current.keys()]) {
      if (!livePeerIds.has(key)) remotePeersRef.current.delete(key);
    }
  }, [uid, remotePeerIds]);

  const refreshAggregate = useCallback(() => {
    pruneStalePeers();
    if (remotePeersRef.current.size === 0) {
      const { MediaStream: NativeMediaStream } = require("react-native-webrtc");
      for (const [channel, pc] of pcsRef.current.entries()) {
        if (pc?.connectionState !== "connected") continue;
        for (const receiver of pc.getReceivers?.() ?? []) {
          const track = receiver?.track;
          if (!track || track.kind !== "video" || track.readyState === "ended") continue;
          const stream = new NativeMediaStream([track]);
          const url = typeof stream.toURL === "function" ? stream.toURL() : undefined;
          const parsedPeer = peerIdFromCallChannel(channel, uid) || remotePeerIds[0];
          upsertRemotePeer(remotePeersRef.current, parsedPeer || SINGLE_PEER_KEY, url, true);
        }
      }
    }
    const pcs = [...pcsRef.current.values()];
    const states = pcs.map((pc) => pc?.connectionState as string | undefined);
    const connected = states.filter((s) => s === "connected").length;
    const failed = states.some((s) => s === "failed" || s === "closed");
    const reconnecting = states.some((s) => s === "disconnected" || s === "connecting");
    setJoined(connected > 0);
    setRemoteCount(connected);
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
    } else if (failed && pcs.length <= 1) {
      setConnectionPhase("failed");
    } else if (reconnecting && pcs.length > 0) {
      setConnectionPhase("reconnecting");
    } else if (pcs.length > 0) {
      setConnectionPhase("connecting");
    }
  }, [isVideo, uid, remotePeerIds, pruneStalePeers]);

  const refreshAggregateRef = useRef(refreshAggregate);
  useEffect(() => {
    refreshAggregateRef.current = refreshAggregate;
  }, [refreshAggregate]);

  const channelsKey = channels.join("|");

  useEffect(() => {
    if (!primaryChannel || !uid) return;

    let stopped = false;
    let localStream: any = null;

    const postJson = async (path: string, body: unknown) => {
      await webrtcFetch(path, sessionToken, { method: "POST", body: JSON.stringify(body) });
    };

    const teardownChannel = async (channel: string) => {
      const t = pollTimersRef.current.get(channel);
      if (t) {
        clearInterval(t);
        pollTimersRef.current.delete(channel);
      }
      const existing = pcsRef.current.get(channel);
      if (existing) {
        try {
          existing.close?.();
        } catch {
          /* ignore */
        }
        pcsRef.current.delete(channel);
      }
      rolesRef.current.delete(channel);
      candidateCursorsRef.current.delete(channel);
      await webrtcFetch(`/sessions/${encodeURIComponent(channel)}`, sessionToken, { method: "DELETE" }).catch(() => {});
    };

    const connectChannel = async (channel: string, sharedLocalStream: any) => {
      if (stopped) return;
      if (pcsRef.current.has(channel) && pollTimersRef.current.has(channel)) return;
      await teardownChannel(channel);
      if (stopped) return;
      const {
        RTCPeerConnection,
        RTCSessionDescription,
        RTCIceCandidate,
      } = require("react-native-webrtc");

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
        const parsedPeer = peerIdFromCallChannel(channel, uid) || remotePeerIds[0];
        const storageKey = parsedPeer || SINGLE_PEER_KEY;
        upsertRemotePeer(remotePeersRef.current, storageKey, url, hasVid);
        refreshAggregateRef.current();
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
      let iceRestartTimer: ReturnType<typeof setTimeout> | null = null;
      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === "failed" || state === "closed") {
          if (pcsRef.current.size <= 1) {
            setError("Could not connect. Check internet or try Wi‑Fi/mobile data.");
          }
        }
        if (state === "disconnected") {
          if (iceRestartTimer) clearTimeout(iceRestartTimer);
          iceRestartTimer = setTimeout(() => {
            iceRestartTimer = null;
            if (pc.connectionState !== "disconnected") return;
            try {
              if (typeof pc.restartIce === "function") pc.restartIce();
            } catch {
              /* ignore */
            }
          }, ICE_RESTART_AFTER_MS);
        } else if (iceRestartTimer) {
          clearTimeout(iceRestartTimer);
          iceRestartTimer = null;
        }
        refreshAggregateRef.current();
      };

      if (role === "caller") {
        if (pc.signalingState === "closed") return;
        try {
          const offer = await pc.createOffer();
          if (stopped || pcsRef.current.get(channel) !== pc || pc.signalingState === "closed") return;
          await pc.setLocalDescription(offer);
          await postJson(`/sessions/${encodeURIComponent(channel)}/offer`, { offer });
        } catch (e: any) {
          const msg = e?.message ?? "";
          if (!isBenignSignalingError(msg)) throw e;
        }
      }

      const pollTimer = setInterval(() => {
        void (async () => {
          try {
            const pcNow = pcsRef.current.get(channel);
            if (stopped || !pcNow || pcNow.signalingState === "closed") return;
            const activeRole = rolesRef.current.get(channel) ?? "caller";
            const session = await webrtcFetch(`/sessions/${encodeURIComponent(channel)}`, sessionToken).then((r) => r.json()) as {
              session?: { offer?: RTCSessionDescriptionInit | null; answer?: RTCSessionDescriptionInit | null };
            };
            if (
              activeRole === "callee"
              && session.session?.offer
              && pcNow.signalingState === "stable"
              && !pcNow.currentRemoteDescription
            ) {
              await pcNow.setRemoteDescription(new RTCSessionDescription(session.session.offer));
              const answer = await pcNow.createAnswer();
              if (stopped || pcsRef.current.get(channel) !== pcNow || pcNow.signalingState === "closed") return;
              await pcNow.setLocalDescription(answer);
              await postJson(`/sessions/${encodeURIComponent(channel)}/answer`, { answer });
            }
            if (
              activeRole === "caller"
              && session.session?.answer
              && pcNow.signalingState === "have-local-offer"
            ) {
              await pcNow.setRemoteDescription(new RTCSessionDescription(session.session.answer));
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
            if (pcsRef.current.size <= 1) setError(msg);
            const t = pollTimersRef.current.get(channel);
            if (t) {
              clearInterval(t);
              pollTimersRef.current.delete(channel);
            }
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
      const peerLoad = Math.max(remotePeerIds.length, 1);
      const stream = await mediaDevices.getUserMedia(buildCallMediaConstraints(isVideo, lowData, peerLoad));
      localStreamRef.current = stream;
      setLocalStreamUrl(typeof stream.toURL === "function" ? stream.toURL() : undefined);
      return stream;
    };

    const syncChannels = async () => {
      try {
        localStream = await ensureLocalStream();
        await connectMeshPeersStaggered(channels, async (channel) => {
          if (stopped) return;
          await connectChannel(channel, localStream);
        });
        const active = new Set(channels);
        for (const [channel] of [...pollTimersRef.current.entries()]) {
          if (!active.has(channel)) await teardownChannel(channel);
        }
        refreshAggregateRef.current();
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
      for (const timer of pollTimersRef.current.values()) clearInterval(timer);
      pollTimersRef.current.clear();
      for (const [channel, pc] of [...pcsRef.current.entries()]) {
        try {
          pc?.close?.();
        } catch {
          /* ignore */
        }
        webrtcFetch(`/sessions/${encodeURIComponent(channel)}`, sessionToken, { method: "DELETE" }).catch(() => {});
      }
      pcsRef.current.clear();
      rolesRef.current.clear();
      candidateCursorsRef.current.clear();
    };
  }, [primaryChannel, uid, isVideo, channelsKey, sessionToken]);

  useEffect(() => {
    return () => {
      setProximityScreenOff(false);
      void stopInCallSession();
      for (const timer of pollTimersRef.current.values()) clearInterval(timer);
      pollTimersRef.current.clear();
      localStreamRef.current?.getTracks?.().forEach((track: any) => track.stop());
      localStreamRef.current = null;
      for (const pc of pcsRef.current.values()) pc?.close?.();
      pcsRef.current.clear();
      rolesRef.current.clear();
      candidateCursorsRef.current.clear();
    };
  }, [primaryChannel, uid]);

  return {
    joined,
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
      setError(null);
      await stopInCallSession();
      for (const timer of pollTimersRef.current.values()) clearInterval(timer);
      pollTimersRef.current.clear();
      const channels = [...pcsRef.current.keys()];
      localStreamRef.current?.getTracks?.().forEach((track: any) => track.stop());
      localStreamRef.current = null;
      for (const pc of pcsRef.current.values()) {
        try {
          pc?.close?.();
        } catch {
          /* ignore */
        }
      }
      pcsRef.current.clear();
      rolesRef.current.clear();
      candidateCursorsRef.current.clear();
      remotePeersRef.current.clear();
      setJoined(false);
      setRemoteCount(0);
      setRemotePeers([]);
      setRemoteStreamUrl(undefined);
      setConnectionPhase("connecting");
      await Promise.all(
        channels.map((channel) =>
          webrtcFetch(`/sessions/${encodeURIComponent(channel)}`, sessionToken, { method: "DELETE" }).catch(() => {}),
        ),
      );
    },
  };
}

import { useCallback, useEffect, useRef, useState } from "react";
import { PermissionsAndroid, Platform } from "react-native";
import { getApiUrl } from "@/lib/api";
import { peerChannel, VIDEH_ICE_SERVERS } from "@/lib/webrtcIce";
import type { VidehCallState } from "./videhCallTypes";

export type { VidehCallState } from "./videhCallTypes";

type Role = "caller" | "callee";

function channelsForCall(baseChannel: string, uid: number, remotePeerIds: number[]): string[] {
  if (!baseChannel) return [];
  if (remotePeerIds.length === 0) return [baseChannel];
  return remotePeerIds.map((peerId) => peerChannel(baseChannel, uid, peerId));
}

export function useVidehCall(
  baseChannel: string,
  uid: number,
  isVideo: boolean,
  remotePeerIds: number[] = [],
): VidehCallState {
  const channels = channelsForCall(baseChannel, uid, remotePeerIds);
  const primaryChannel = channels[0] ?? "";

  const pcsRef = useRef<Map<string, any>>(new Map());
  const localStreamRef = useRef<any>(null);
  const rolesRef = useRef<Map<string, Role>>(new Map());
  const candidateCursorsRef = useRef<Map<string, number>>(new Map());
  const pollTimersRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  const [joined, setJoined] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [remoteCount, setRemoteCount] = useState(0);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [localStreamUrl, setLocalStreamUrl] = useState<string | undefined>();
  const [remoteStreamUrl, setRemoteStreamUrl] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);

  const localVideoId = `videh-local-${primaryChannel}`;
  const remoteVideoId = `videh-remote-${primaryChannel}`;

  const refreshAggregate = useCallback(() => {
    const pcs = [...pcsRef.current.values()];
    const connected = pcs.filter((pc) => pc?.connectionState === "connected").length;
    setJoined(connected > 0);
    setRemoteCount(connected);
  }, []);

  useEffect(() => {
    if (!primaryChannel || !uid) return;

    let stopped = false;
    const baseUrl = getApiUrl();

    const postJson = async (path: string, body: unknown) => {
      await fetch(`${baseUrl}/api/webrtc${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    };

    const connectChannel = async (channel: string, sharedLocalStream: any) => {
      const {
        RTCPeerConnection,
        RTCSessionDescription,
        RTCIceCandidate,
      } = require("react-native-webrtc");

      const sessionRes = await fetch(`${baseUrl}/api/webrtc/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, userId: uid, type: isVideo ? "video" : "audio" }),
      });
      const sessionData = await sessionRes.json() as { success?: boolean; role?: Role };
      if (!sessionData.success || !sessionData.role) throw new Error("Could not start call signaling.");
      const role = sessionData.role;
      rolesRef.current.set(channel, role);
      candidateCursorsRef.current.set(channel, 0);

      const pc = new RTCPeerConnection({ iceServers: VIDEH_ICE_SERVERS });
      pcsRef.current.set(channel, pc);
      sharedLocalStream.getTracks().forEach((track: any) => pc.addTrack(track, sharedLocalStream));

      pc.onicecandidate = (event: any) => {
        if (event.candidate) {
          const candidate = typeof event.candidate.toJSON === "function" ? event.candidate.toJSON() : event.candidate;
          void postJson(`/sessions/${encodeURIComponent(channel)}/candidates`, { role, candidate });
        }
      };
      pc.ontrack = (event: any) => {
        const stream = event.streams?.[0] ?? event.stream;
        if (!stream) return;
        setHasRemoteVideo(stream.getVideoTracks?.().length > 0);
        setRemoteStreamUrl(typeof stream.toURL === "function" ? stream.toURL() : undefined);
        refreshAggregate();
      };
      pc.onaddstream = (event: any) => {
        const stream = event.stream;
        if (!stream) return;
        setHasRemoteVideo(stream.getVideoTracks?.().length > 0);
        setRemoteStreamUrl(typeof stream.toURL === "function" ? stream.toURL() : undefined);
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

      const pollTimer = setInterval(async () => {
        const pcNow = pcsRef.current.get(channel);
        if (stopped || !pcNow) return;
        const activeRole = rolesRef.current.get(channel) ?? "caller";
        const session = await fetch(`${baseUrl}/api/webrtc/sessions/${encodeURIComponent(channel)}`).then((r) => r.json()) as {
          session?: { offer?: RTCSessionDescriptionInit | null; answer?: RTCSessionDescriptionInit | null };
        };
        if (activeRole === "callee" && session.session?.offer && !pcNow.remoteDescription) {
          await pcNow.setRemoteDescription(new RTCSessionDescription(session.session.offer));
          const answer = await pcNow.createAnswer();
          await pcNow.setLocalDescription(answer);
          await postJson(`/sessions/${encodeURIComponent(channel)}/answer`, { answer });
        }
        if (activeRole === "caller" && session.session?.answer && !pcNow.remoteDescription) {
          await pcNow.setRemoteDescription(new RTCSessionDescription(session.session.answer));
        }

        const since = candidateCursorsRef.current.get(channel) ?? 0;
        const candidateRes = await fetch(
          `${baseUrl}/api/webrtc/sessions/${encodeURIComponent(channel)}/candidates?role=${activeRole}&since=${since}`,
        ).then((r) => r.json()) as { candidates?: RTCIceCandidateInit[]; next?: number };
        for (const candidate of candidateRes.candidates ?? []) {
          await pcNow.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
        }
        candidateCursorsRef.current.set(channel, candidateRes.next ?? since);
      }, 800);
      pollTimersRef.current.set(channel, pollTimer);
    };

    const connectAll = async () => {
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

        const { mediaDevices } = require("react-native-webrtc");
        const localStream = await mediaDevices.getUserMedia({ audio: true, video: isVideo });
        localStreamRef.current = localStream;
        setLocalStreamUrl(typeof localStream.toURL === "function" ? localStream.toURL() : undefined);

        for (const channel of channels) {
          await connectChannel(channel, localStream);
        }
      } catch (e: any) {
        const msg = e?.message ?? "";
        if (msg.includes("Cannot find module") || msg.includes("TurboModuleRegistry") || msg.includes("NativeModules")) {
          setError("NATIVE_WEBRTC_UNAVAILABLE");
        } else {
          setError(msg || "Failed to start native self-hosted call.");
        }
      }
    };

    void connectAll();

    return () => {
      stopped = true;
      for (const timer of pollTimersRef.current.values()) clearInterval(timer);
      pollTimersRef.current.clear();
      localStreamRef.current?.getTracks?.().forEach((track: any) => track.stop());
      for (const pc of pcsRef.current.values()) pc?.close?.();
      pcsRef.current.clear();
      for (const channel of channels) {
        fetch(`${baseUrl}/api/webrtc/sessions/${encodeURIComponent(channel)}`, { method: "DELETE" }).catch(() => {});
      }
    };
  }, [primaryChannel, uid, isVideo, channels.join("|"), refreshAggregate]);

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
      localStreamRef.current?.getAudioTracks?.().forEach((track: any) => { track.enabled = muted; });
      setMuted((m) => !m);
    },
    toggleCamera: () => {
      localStreamRef.current?.getVideoTracks?.().forEach((track: any) => { track.enabled = cameraOff; });
      setCameraOff((c) => !c);
    },
    toggleSpeaker: () => setSpeakerOn((s) => !s),
    leave: async () => {
      localStreamRef.current?.getTracks?.().forEach((track: any) => track.stop());
      for (const pc of pcsRef.current.values()) pc?.close?.();
    },
  };
}

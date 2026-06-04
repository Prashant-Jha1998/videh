import { useRouter } from "expo-router";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";
import type { IncomingCallInfo } from "@/components/IncomingCallOverlay";
import { useApp } from "@/context/AppContext";
import { useVidehCall } from "@/hooks/useVidehCall";
import {
  playCallBusyTone,
  playCallUnavailableTone,
  startOutgoingRingback,
  stopCallAlert,
} from "@/lib/callRingtone";
import { addUsersToOngoingCall } from "@/lib/callParticipants";
import { webrtcFetch } from "@/lib/webrtcApi";
import { chooseInCallAudioRoute, wakeScreenForIncomingCall, type InCallAudioRoute } from "@/lib/inCallAudio";
import { onCallSignal } from "@/lib/callEvents";
import {
  registerCallSessionDismissHandler,
  requestDismissIncomingCallUi,
} from "@/lib/incomingCallUiBridge";
import { resetCallNavigationGuard, runLeaveCallScreen } from "@/lib/callNavigationGuard";
import { startNativeOngoingCallSession } from "@/lib/videhNativeCallUi";
import {
  endCallKeep,
  showCallKeepIncoming,
  startCallKeepOutgoing,
} from "@/lib/callKeep";
import { setVideoCallPipEnabled } from "@/lib/callPip";
import { effectiveCallVideo, statusPollIntervalMs } from "@/lib/callStability";
import type { RemoteCallPeerStream } from "@/hooks/videhCallTypes";

export type CallSession = {
  chatId: string;
  contactName: string;
  isVideo: boolean;
  channel: string;
  callId: string;
  isIncoming: boolean;
  ringing: boolean;
  minimized: boolean;
  engineActive: boolean;
  onHold?: boolean;
};

type RouteParams = {
  id?: string;
  name?: string;
  type?: string;
  channel?: string;
  callId?: string;
  incoming?: string;
  ringing?: string;
};

type CallSessionContextValue = {
  session: CallSession | null;
  joined: boolean;
  connectionPhase: string;
  error: string | null;
  muted: boolean;
  cameraOff: boolean;
  speakerOn: boolean;
  remoteCount: number;
  hasRemoteVideo: boolean;
  duration: number;
  statusText: string;
  localStreamUrl?: string;
  remoteStreamUrl?: string;
  localVideoId: string;
  remoteVideoId: string;
  participantCount: number;
  acceptedCount: number;
  ringingCount: number;
  initFromRoute: (params: RouteParams) => void;
  presentIncomingCall: (call: IncomingCallInfo) => void;
  acceptIncoming: (callInfo?: IncomingCallInfo) => Promise<void>;
  declineIncoming: (declineMessage?: string) => Promise<void>;
  minimizeCall: () => void;
  returnToCallScreen: () => void;
  endCall: () => Promise<void>;
  toggleMute: () => void;
  toggleCamera: () => void;
  toggleSpeaker: () => void;
  addParticipants: (userIds: number[]) => Promise<{ added: number; busy: number }>;
  inviteeUserIds: number[];
  remotePeers: RemoteCallPeerStream[];
  switchCallMediaType: (video: boolean) => Promise<void>;
  setInCallAudioRoute: (route: InCallAudioRoute) => Promise<void>;
  heldSession: CallSession | null;
  holdActiveCall: () => Promise<void>;
  resumeHeldCall: () => Promise<void>;
  endHeldCall: () => Promise<void>;
  shareScreen: () => Promise<boolean>;
  stopScreenShare: () => Promise<void>;
};

const CallSessionContext = createContext<CallSessionContextValue | null>(null);

function formatDuration(s: number): string {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

export function CallSessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, refreshCallLogs } = useApp();
  const [session, setSession] = useState<CallSession | null>(null);
  const [heldSession, setHeldSession] = useState<CallSession | null>(null);
  const [participantCount, setParticipantCount] = useState(2);
  const [acceptedCount, setAcceptedCount] = useState(1);
  const [ringingCount, setRingingCount] = useState(0);
  const [acceptedUserIds, setAcceptedUserIds] = useState<number[]>([]);
  const [callerId, setCallerId] = useState<number | null>(null);
  const [inviteeUserIds, setInviteeUserIds] = useState<number[]>([]);
  const [statusHint, setStatusHint] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const endedTonePlayed = useRef(false);
  const endingCallRef = useRef(false);
  const sessionCallIdRef = useRef<string | null>(null);
  const outgoingCallInitRef = useRef<string | null>(null);
  const busyEndHandledRef = useRef<string | null>(null);
  const dismissedCallIdsRef = useRef<Set<string>>(new Set());
  const sessionRingingRef = useRef(false);
  const sessionEngineActiveRef = useRef(false);

  useEffect(() => {
    sessionCallIdRef.current = session?.callId ?? null;
    sessionRingingRef.current = Boolean(session?.ringing);
    sessionEngineActiveRef.current = Boolean(session?.engineActive);
  }, [session?.callId, session?.ringing, session?.engineActive]);

  const userId = user?.dbId ?? 0;
  const remotePeerIds = useMemo(() => {
    if (!session?.channel || !userId || !session.engineActive) return [];
    return acceptedUserIds.filter((peerId) => peerId !== userId);
  }, [acceptedUserIds, userId, session?.channel, session?.engineActive]);

  const onCallUserIds = useMemo(() => {
    const ids = new Set<number>(inviteeUserIds);
    if (callerId) ids.add(callerId);
    if (userId) ids.add(userId);
    return [...ids];
  }, [inviteeUserIds, callerId, userId]);

  const engineChannel = session?.engineActive ? session.channel : "";
  const engineVideo = useMemo(() => {
    if (!session?.isVideo) return false;
    return effectiveCallVideo(true, Math.max(acceptedCount, acceptedUserIds.length, 2));
  }, [session?.isVideo, acceptedCount, acceptedUserIds.length]);

  const call = useVidehCall(
    engineChannel,
    userId,
    engineVideo,
    session?.engineActive ? remotePeerIds : [],
    user?.sessionToken,
  );

  const clearSession = useCallback(() => {
    setSession(null);
    setDuration(0);
    setStatusHint(null);
    endedTonePlayed.current = false;
    endingCallRef.current = false;
    outgoingCallInitRef.current = null;
    busyEndHandledRef.current = null;
    resetCallNavigationGuard();
  }, []);

  const leaveCallScreen = useCallback(() => {
    runLeaveCallScreen(() => {
      if (router.canGoBack()) router.back();
      else router.replace("/(tabs)/chats");
    });
  }, [router]);

  const dismissIncomingRinging = useCallback(
    async (callId?: string) => {
      const id = callId ?? sessionCallIdRef.current ?? undefined;
      if (!id) return;
      if (sessionCallIdRef.current && sessionCallIdRef.current !== id) return;
      if (sessionCallIdRef.current === id && !sessionRingingRef.current) return;
      if (endingCallRef.current) return;
      endingCallRef.current = true;
      dismissedCallIdsRef.current.add(id);
      requestDismissIncomingCallUi(id);
      await stopCallAlert();
      clearSession();
      leaveCallScreen();
    },
    [clearSession, leaveCallScreen],
  );

  const onCallEnded = useCallback(() => {
    const endedCallId = sessionCallIdRef.current ?? undefined;
    const shouldLeave = sessionEngineActiveRef.current || sessionRingingRef.current;
    if (endedCallId) dismissedCallIdsRef.current.add(endedCallId);
    requestDismissIncomingCallUi(endedCallId);
    if (endingCallRef.current) {
      if (shouldLeave) leaveCallScreen();
      return;
    }
    endingCallRef.current = true;
    void (async () => {
      await stopCallAlert();
      if (shouldLeave) await call.leave();
      if (endedCallId) endCallKeep(endedCallId);
      void refreshCallLogs();
      clearSession();
      leaveCallScreen();
    })();
  }, [clearSession, refreshCallLogs, leaveCallScreen, call]);

  const handleRemoteCallEnd = useCallback(
    (callId?: string) => {
      const id = callId ?? sessionCallIdRef.current ?? undefined;
      if (!id || sessionCallIdRef.current !== id || endingCallRef.current) return;
      if (sessionRingingRef.current) {
        void dismissIncomingRinging(id);
        return;
      }
      onCallEnded();
    },
    [dismissIncomingRinging, onCallEnded],
  );

  const pushCallRoute = useCallback((s: CallSession, replace = false) => {
    const route = {
      pathname: "/call/[id]" as const,
      params: {
        id: s.chatId,
        name: s.contactName,
        type: s.isVideo ? "video" : "audio",
        channel: s.channel,
        callId: s.callId,
        incoming: s.isIncoming ? "1" : "0",
        ringing: s.ringing ? "1" : "0",
      },
    };
    if (replace) router.replace(route);
    else router.push(route);
  }, [router]);

  const endCall = useCallback(async () => {
    endingCallRef.current = true;
    await stopCallAlert();
    setVideoCallPipEnabled(false);
    const endingCallId = session?.callId;
    try {
      if (session?.engineActive || call.error) await call.leave();
      if (endingCallId) {
        endCallKeep(endingCallId);
        requestDismissIncomingCallUi(endingCallId);
        await webrtcFetch(`/calls/${endingCallId}/end`, user?.sessionToken, { method: "POST" }).catch(() => {});
      }
    } finally {
      void refreshCallLogs();
      clearSession();
      setHeldSession(null);
      resetCallNavigationGuard();
      leaveCallScreen();
    }
  }, [session, call, user?.sessionToken, clearSession, refreshCallLogs, leaveCallScreen]);

  const holdActiveCall = useCallback(async () => {
    if (!session?.callId || !user?.dbId) return;
    await webrtcFetch(`/calls/${session.callId}/hold`, user.sessionToken, {
      method: "POST",
      body: JSON.stringify({ hold: true }),
    }).catch(() => {});
    if (session.engineActive) await call.leave();
    const snap: CallSession = {
      ...session,
      onHold: true,
      engineActive: false,
      minimized: true,
      ringing: false,
    };
    setHeldSession(snap);
    setSession(null);
    setVideoCallPipEnabled(false);
    if (router.canGoBack()) router.back();
  }, [session, call, user?.dbId, user?.sessionToken, router]);

  const resumeHeldCall = useCallback(async () => {
    if (!heldSession?.callId || !user?.dbId) return;
    await webrtcFetch(`/calls/${heldSession.callId}/hold`, user.sessionToken, {
      method: "POST",
      body: JSON.stringify({ hold: false }),
    }).catch(() => {});
    const next: CallSession = {
      ...heldSession,
      onHold: false,
      engineActive: true,
      minimized: false,
    };
    setHeldSession(null);
    setSession(next);
    pushCallRoute(next, true);
  }, [heldSession, user?.dbId, user?.sessionToken, pushCallRoute]);

  const endHeldCall = useCallback(async () => {
    if (!heldSession?.callId) return;
    endCallKeep(heldSession.callId);
    await webrtcFetch(`/calls/${heldSession.callId}/end`, user?.sessionToken, { method: "POST" }).catch(() => {});
    setHeldSession(null);
    void refreshCallLogs();
  }, [heldSession, user?.sessionToken, refreshCallLogs]);

  const presentIncomingCall = useCallback((callInfo: IncomingCallInfo) => {
    wakeScreenForIncomingCall();
    showCallKeepIncoming(
      callInfo.callId,
      callInfo.callerName,
      callInfo.chatId,
      callInfo.type === "video",
    );
    const next: CallSession = {
      chatId: String(callInfo.chatId),
      contactName: callInfo.callerName,
      isVideo: callInfo.type === "video",
      channel: callInfo.channel,
      callId: callInfo.callId,
      isIncoming: true,
      ringing: true,
      minimized: false,
      engineActive: false,
    };
    setSession(next);
    pushCallRoute(next);
  }, [pushCallRoute]);

  const initFromRoute = useCallback((params: RouteParams) => {
    const chatId = params.id ?? "";
    if (!chatId) return;
    const routeCallId = params.callId ?? "";
    if (routeCallId && dismissedCallIdsRef.current.has(routeCallId)) {
      leaveCallScreen();
      return;
    }
    const isIncoming = params.incoming === "1";
    const ringing = params.ringing === "1";
    const isVideo = params.type === "video";
    const contactName = params.name ?? "Contact";

    setSession((prev) => {
      if (prev?.callId && params.callId && prev.callId === params.callId) {
        return { ...prev, minimized: false, contactName: params.name ?? prev.contactName };
      }
      return {
        chatId,
        contactName,
        isVideo,
        channel: params.channel ?? "",
        callId: params.callId ?? "",
        isIncoming,
        ringing: isIncoming && ringing,
        minimized: false,
        engineActive: isIncoming ? !ringing && Boolean(params.channel) : Boolean(params.channel),
      };
    });

    if (!isIncoming && !params.channel && user?.dbId) {
      const outgoingKey = `${chatId}:${isVideo ? "video" : "audio"}`;
      if (outgoingCallInitRef.current === outgoingKey) return;
      outgoingCallInitRef.current = outgoingKey;

      void webrtcFetch("/calls", user.sessionToken, {
        method: "POST",
        body: JSON.stringify({ chatId: Number(chatId), type: isVideo ? "video" : "audio" }),
      })
        .then((res) => res.json())
        .then((data: {
          success?: boolean;
          allInviteesBusy?: boolean;
          call?: { channel?: string; callId?: string; participantCount?: number; acceptedCount?: number; ringingCount?: number };
        }) => {
          if (!data.success || !data.call?.channel) return;
          setSession((prev) => {
            if (!prev || prev.chatId !== chatId) return prev;
            return {
              ...prev,
              channel: data.call!.channel!,
              callId: data.call!.callId ?? prev.callId,
              engineActive: true,
              ringing: false,
            };
          });
          setParticipantCount(data.call!.participantCount ?? 2);
          setAcceptedCount(data.call!.acceptedCount ?? 1);
          setRingingCount(data.call!.ringingCount ?? 0);
          if (user?.dbId) setAcceptedUserIds((prev) => {
            const next = new Set(prev);
            next.add(user.dbId!);
            return [...next];
          });
          if (data.allInviteesBusy) {
            void (async () => {
              if (busyEndHandledRef.current === data.call?.callId) return;
              busyEndHandledRef.current = data.call?.callId ?? "busy";
              await stopCallAlert();
              await playCallBusyTone();
              onCallEnded();
            })();
          }
        })
        .catch(() => {});
    }
  }, [user?.dbId, user?.sessionToken, onCallEnded, leaveCallScreen]);

  const acceptIncoming = useCallback(async (callInfo?: IncomingCallInfo) => {
    const callId = callInfo?.callId ?? session?.callId;
    if (!callId || !user?.dbId) return;

    if (callInfo) {
      const next: CallSession = {
        chatId: String(callInfo.chatId),
        contactName: callInfo.callerName,
        isVideo: callInfo.type === "video",
        channel: callInfo.channel,
        callId: callInfo.callId,
        isIncoming: true,
        ringing: false,
        minimized: false,
        engineActive: true,
      };
      setSession(next);
      pushCallRoute(next);
    }

    await stopCallAlert();
    await webrtcFetch(`/calls/${callId}/respond`, user.sessionToken, {
      method: "POST",
      body: JSON.stringify({ userId: user.dbId, action: "accept" }),
    }).catch(() => {});
    void webrtcFetch(`/calls/${callId}/status?userId=${user.dbId}`, user.sessionToken)
      .then(async (res) => {
        const data = (await res.json()) as { acceptedUserIds?: number[]; callerId?: number };
        if (Array.isArray(data.acceptedUserIds) && data.acceptedUserIds.length > 0) {
          setAcceptedUserIds(data.acceptedUserIds);
        } else if (typeof data.callerId === "number") {
          setAcceptedUserIds([user.dbId, data.callerId]);
        }
      })
      .catch(() => {});
    setSession((prev) =>
      prev && prev.callId === callId
        ? { ...prev, ringing: false, engineActive: true, minimized: false }
        : prev,
    );
  }, [session?.callId, user?.dbId, user?.sessionToken, pushCallRoute]);

  const declineIncoming = useCallback(async (declineMessage?: string) => {
    if (!session?.callId || !user?.dbId) return;
    await stopCallAlert();
    await webrtcFetch(`/calls/${session.callId}/respond`, user.sessionToken, {
      method: "POST",
      body: JSON.stringify({
        userId: user.dbId,
        action: "decline",
        ...(declineMessage ? { declineMessage } : {}),
      }),
    }).catch(() => {});
    if (session?.callId) dismissedCallIdsRef.current.add(session.callId);
    clearSession();
    leaveCallScreen();
  }, [session?.callId, user?.dbId, user?.sessionToken, clearSession, leaveCallScreen]);

  const minimizeCall = useCallback(() => {
    setSession((prev) => (prev ? { ...prev, minimized: true } : prev));
    if (router.canGoBack()) router.back();
  }, [router]);

  const addParticipants = useCallback(async (userIds: number[]) => {
    if (!session?.callId || !session.engineActive) {
      throw new Error("Start or join the call before adding people.");
    }
    const data = await addUsersToOngoingCall(session.callId, userIds, user?.sessionToken);
    if (!data.success) throw new Error(data.message ?? "Could not add to call.");
    const added = data.addedRinging?.length ?? 0;
    const busy = data.busyIds?.length ?? 0;
    if (added === 0 && busy === 0 && (data.alreadyOnCall?.length ?? 0) > 0) {
      throw new Error("Selected contacts are already on this call.");
    }
    return { added, busy };
  }, [session?.callId, session?.engineActive, user?.sessionToken]);

  const returnToCallScreen = useCallback(() => {
    if (!session) return;
    const next = { ...session, minimized: false };
    setSession(next);
    pushCallRoute(next, true);
  }, [session, pushCallRoute]);

  useEffect(() => {
    if (!session || session.isIncoming || session.ringing) return;
    if (call.joined) {
      void stopCallAlert();
      return;
    }
    void startOutgoingRingback();
    const timeout = setTimeout(() => {
      void (async () => {
        if (call.joined) return;
        await stopCallAlert();
        await playCallUnavailableTone();
        if (session.callId) {
          await webrtcFetch(`/calls/${session.callId}/end`, user?.sessionToken, { method: "POST" }).catch(() => {});
        }
        onCallEnded();
      })();
    }, 60000);
    return () => {
      clearTimeout(timeout);
      void stopCallAlert();
    };
  }, [session?.callId, session?.isIncoming, session?.ringing, call.joined, user?.sessionToken, onCallEnded]);

  useEffect(() => {
    if (!session?.callId || !userId || !session.engineActive) return;
    const polledCallId = session.callId;

    const applyStatus = async (res: Response) => {
      const data = (await res.json()) as {
        success?: boolean;
        acceptedCount?: number;
        ringingCount?: number;
        busyCount?: number;
        declinedCount?: number;
        missedCount?: number;
        allInviteesBusy?: boolean;
        call?: { participantCount?: number };
        ended?: boolean;
        acceptedUserIds?: number[];
        callerId?: number;
        statuses?: Record<string, string>;
      };
      if (sessionCallIdRef.current !== polledCallId || endingCallRef.current) return;
      if (!data.success || res.status === 404) {
        handleRemoteCallEnd(polledCallId);
        return;
      }
      setAcceptedCount(data.acceptedCount ?? 1);
      setRingingCount(data.ringingCount ?? 0);
      setParticipantCount(data.call?.participantCount ?? participantCount);
      if (Array.isArray(data.acceptedUserIds) && data.acceptedUserIds.length > 0) {
        setAcceptedUserIds(data.acceptedUserIds);
      }
      if (typeof data.callerId === "number") setCallerId(data.callerId);
      if (data.statuses && typeof data.statuses === "object") {
        setInviteeUserIds(
          Object.keys(data.statuses)
            .map((k) => Number(k))
            .filter((id) => Number.isFinite(id)),
        );
      }

      const remoteAccepted = (data.acceptedCount ?? 1) > 1;
      if (remoteAccepted && !call.joined) {
        void stopCallAlert();
        setStatusHint("Connecting…");
      }

      if (!call.joined && !endedTonePlayed.current) {
        if (data.allInviteesBusy || ((data.busyCount ?? 0) > 0 && (data.ringingCount ?? 0) === 0 && !remoteAccepted)) {
          if (busyEndHandledRef.current === polledCallId) return;
          busyEndHandledRef.current = polledCallId;
          endedTonePlayed.current = true;
          void (async () => {
            try {
              await stopCallAlert();
              await playCallBusyTone();
              onCallEnded();
            } catch { /* ignore */ }
          })();
          return;
        }
        if ((data.declinedCount ?? 0) > 0 && (data.ringingCount ?? 0) === 0 && !remoteAccepted) {
          if (busyEndHandledRef.current === polledCallId) return;
          busyEndHandledRef.current = polledCallId;
          endedTonePlayed.current = true;
          void (async () => {
            try {
              await stopCallAlert();
              await playCallUnavailableTone();
              onCallEnded();
            } catch { /* ignore */ }
          })();
          return;
        }
      }

      if (data.ended) {
        if (!endedTonePlayed.current && !call.joined) {
          endedTonePlayed.current = true;
          const unavailable = (data.missedCount ?? 0) > 0;
          void (async () => {
            try {
              await stopCallAlert();
              if (unavailable) await playCallUnavailableTone();
              onCallEnded();
            } catch { /* ignore */ }
          })();
          return;
        }
        void stopCallAlert();
        onCallEnded();
      }
    };

    const poll = () => {
      void webrtcFetch(`/calls/${polledCallId}/status?userId=${userId}`, user?.sessionToken)
        .then(applyStatus)
        .catch(() => {});
    };

    poll();
    const timer = setInterval(poll, statusPollIntervalMs(participantCount));
    return () => clearInterval(timer);
  }, [session?.callId, session?.engineActive, userId, participantCount, call.joined, user?.sessionToken, onCallEnded, handleRemoteCallEnd]);

  useEffect(() => {
    if (!call.joined) return;
    const t = setInterval(() => setDuration((d) => d + 1), 1000);
    return () => clearInterval(t);
  }, [call.joined]);

  useEffect(() => {
    if (!session?.engineActive || session.ringing || !call.joined) {
      setVideoCallPipEnabled(false);
      return;
    }
    startNativeOngoingCallSession(session.isVideo);
    setVideoCallPipEnabled(session.isVideo);
    if (session.callId && !session.isIncoming) {
      startCallKeepOutgoing(session.callId, session.contactName, session.isVideo);
    }
  }, [session?.engineActive, session?.ringing, session?.isVideo, session?.callId, session?.isIncoming, session?.contactName, call.joined]);

  useEffect(() => {
    const unsub = onCallSignal((payload) => {
      const action = String(payload.action ?? "");
      const callId = payload.callId ? String(payload.callId) : "";
      if (
        callId
        && (action === "ended" || action === "declined" || action === "missed" || action === "busy" || action === "cancelled")
      ) {
        handleRemoteCallEnd(callId);
        return;
      }
      if (action === "accepted" || action === "participants_updated") {
        const raw = payload as { acceptedUserIds?: number[] };
        if (Array.isArray(raw.acceptedUserIds) && raw.acceptedUserIds.length > 0) {
          setAcceptedUserIds(raw.acceptedUserIds);
        }
        return;
      }
      if (action !== "media_type") return;
      const raw = payload as { type?: string; payload?: { type?: string } };
      const nextVideo = (raw.type ?? raw.payload?.type) === "video";
      setSession((prev) => (prev ? { ...prev, isVideo: nextVideo } : prev));
    });
    return unsub;
  }, [handleRemoteCallEnd]);

  useEffect(() => registerCallSessionDismissHandler(handleRemoteCallEnd), [handleRemoteCallEnd]);

  const switchCallMediaType = useCallback(
    async (video: boolean) => {
      if (!session?.callId || !user?.dbId) return;
      await webrtcFetch(`/calls/${session.callId}/media-type`, user.sessionToken, {
        method: "POST",
        body: JSON.stringify({ type: video ? "video" : "audio" }),
      }).catch(() => {});
      setSession((prev) => (prev ? { ...prev, isVideo: video } : prev));
    },
    [session?.callId, user?.sessionToken],
  );

  const setInCallAudioRoute = useCallback(
    async (route: InCallAudioRoute) => {
      await chooseInCallAudioRoute(route);
      const speaker = route === "SPEAKER_PHONE" || route === "BLUETOOTH";
      call.setSpeaker(speaker);
    },
    [call],
  );

  const statusText = useMemo(() => {
    if (!session) return "";
    if (session.ringing) {
      return session.isVideo ? "Incoming video call" : "Incoming voice call";
    }
    if (call.joined) {
      if (call.remoteCount > 0) return formatDuration(duration);
      if (call.connectionPhase === "reconnecting") return "Reconnecting…";
      if (acceptedCount > 1) return "Connecting participants...";
      return "Waiting for other party...";
    }
    if (call.error) {
      return call.error === "NATIVE_WEBRTC_UNAVAILABLE" ? "Connecting..." : `Error: ${call.error}`;
    }
    if (statusHint) return statusHint;
    if (session.isIncoming) return session.isVideo ? "Incoming video call" : "Incoming voice call";
    if (ringingCount > 1) return `Ringing ${ringingCount} people...`;
    return session.isVideo ? "Calling…" : "Ringing…";
  }, [session, call, duration, statusHint, acceptedCount, ringingCount]);

  const value = useMemo<CallSessionContextValue>(
    () => ({
      session,
      joined: call.joined,
      connectionPhase: call.connectionPhase,
      error: call.error,
      muted: call.muted,
      cameraOff: call.cameraOff,
      speakerOn: call.speakerOn,
      remoteCount: call.remoteCount,
      hasRemoteVideo: call.hasRemoteVideo,
      duration,
      statusText,
      localStreamUrl: call.localStreamUrl,
      remoteStreamUrl: call.remoteStreamUrl,
      localVideoId: call.localVideoId,
      remoteVideoId: call.remoteVideoId,
      participantCount,
      acceptedCount,
      ringingCount,
      initFromRoute,
      presentIncomingCall,
      acceptIncoming,
      declineIncoming,
      minimizeCall,
      returnToCallScreen,
      endCall,
      toggleMute: () => call.toggleMute(),
      toggleCamera: () => call.toggleCamera(),
      toggleSpeaker: () => call.toggleSpeaker(),
      addParticipants,
      inviteeUserIds: onCallUserIds,
      remotePeers: call.remotePeers,
      switchCallMediaType,
      setInCallAudioRoute,
      heldSession,
      holdActiveCall,
      resumeHeldCall,
      endHeldCall,
      shareScreen: () => call.shareScreen(),
      stopScreenShare: () => call.stopScreenShare(),
    }),
    [
      session,
      call,
      duration,
      statusText,
      participantCount,
      acceptedCount,
      ringingCount,
      initFromRoute,
      presentIncomingCall,
      acceptIncoming,
      declineIncoming,
      minimizeCall,
      returnToCallScreen,
      endCall,
      addParticipants,
      onCallUserIds,
      inviteeUserIds,
      switchCallMediaType,
      setInCallAudioRoute,
      heldSession,
      holdActiveCall,
      resumeHeldCall,
      endHeldCall,
      call.shareScreen,
      call.stopScreenShare,
    ],
  );

  return <CallSessionContext.Provider value={value}>{children}</CallSessionContext.Provider>;
}

export function useCallSession(): CallSessionContextValue {
  const ctx = useContext(CallSessionContext);
  if (!ctx) throw new Error("useCallSession must be used within CallSessionProvider");
  return ctx;
}

export function shouldRouteIncomingToCallScreen(): boolean {
  return Platform.OS !== "web";
}

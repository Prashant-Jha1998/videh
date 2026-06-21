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
import type { CallOutcome } from "@/components/CallOutcomeScreen";
import { useApp } from "@/context/AppContext";
import { useVidehCall } from "@/hooks/useVidehCall";
import {
  playCallBusyTone,
  playCallUnavailableTone,
  startOutgoingRingback,
  stopCallAlert,
} from "@/lib/callRingtone";
import { addUsersToOngoingCall } from "@/lib/callParticipants";
import { CONNECTING_TIMEOUT_MS, INCOMING_RING_TIMEOUT_MS } from "@/lib/callConstants";
import { webrtcFetch } from "@/lib/webrtcApi";
import { videhSignalingPost } from "@/lib/videhCall/signalingClient";
import { chooseInCallAudioRoute, wakeScreenForIncomingCall, type InCallAudioRoute } from "@/lib/inCallAudio";
import { onCallSignal, resolveCallSignal } from "@/lib/callEvents";
import { callDebug } from "@/lib/callDebug";
import {
  registerCallSessionDismissHandler,
  registerCallSessionEndHandler,
  requestDismissIncomingCallUi,
} from "@/lib/incomingCallUiBridge";
import { rejectIncomingCall } from "@/lib/rejectIncomingCall";
import { fetchIncomingCallDetails } from "@/lib/fetchIncomingCallDetails";
import { isRemotePartyAccepted, isCallCaller } from "@/lib/callRole";
import { stopIncomingCallExperience } from "@/lib/incomingCallExperience";
import { dismissIncomingCallNotification } from "@/lib/incomingCallNotification";
import { resetCallNavigationGuard, runLeaveCallScreen } from "@/lib/callNavigationGuard";
import { startNativeOngoingCallSession } from "@/lib/videhNativeCallUi";
import {
  endCallKeep,
  startCallKeepOutgoing,
} from "@/lib/callKeep";
import { setVideoCallPipEnabled } from "@/lib/callPip";
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
  /** Videh invite caller — set on accept so WebRTC starts on first frame. */
  callerUserId?: number;
};

type RouteParams = {
  id?: string;
  name?: string;
  type?: string;
  channel?: string;
  callId?: string;
  incoming?: string;
  ringing?: string;
  callerId?: string;
};

type CallSessionContextValue = {
  session: CallSession | null;
  joined: boolean;
  mediaReady: boolean;
  /** Both sides accepted the call invite — stable in-call UI (not WebRTC flap). */
  callAnswered: boolean;
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
  callOutcome: CallOutcome | null;
  outcomeSnapshot: { contactName: string; chatId: string; isVideo: boolean } | null;
  dismissCallOutcome: () => void;
  redialFromOutcome: () => void;
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
  const [callOutcome, setCallOutcome] = useState<CallOutcome | null>(null);
  const [outcomeSnapshot, setOutcomeSnapshot] = useState<{
    contactName: string;
    chatId: string;
    isVideo: boolean;
  } | null>(null);
  const endedTonePlayed = useRef(false);
  const endingCallRef = useRef(false);
  const teardownInFlightRef = useRef<Set<string>>(new Set());
  const statusPollMissRef = useRef(0);
  const sessionCallIdRef = useRef<string | null>(null);
  const outgoingCallInitRef = useRef<string | null>(null);
  const busyEndHandledRef = useRef<string | null>(null);
  const dismissedCallIdsRef = useRef<Set<string>>(new Set());
  const sessionRingingRef = useRef(false);
  const sessionEngineActiveRef = useRef(false);
  const negotiateBumpedForCallRef = useRef<string | null>(null);
  const [negotiateBump, setNegotiateBump] = useState(0);

  useEffect(() => {
    sessionCallIdRef.current = session?.callId ?? null;
    sessionRingingRef.current = Boolean(session?.ringing);
    sessionEngineActiveRef.current = Boolean(session?.engineActive);
  }, [session?.callId, session?.ringing, session?.engineActive]);

  const userId = user?.dbId ?? 0;
  const remotePeerIds = useMemo(() => {
    if (!session?.channel || !userId || !session.engineActive) return [];
    const ids = new Set(
      acceptedUserIds.filter((peerId) => peerId > 0 && peerId !== userId),
    );
    if (session.isIncoming && callerId && callerId !== userId) ids.add(callerId);
    if (!session.isIncoming) {
      for (const peerId of inviteeUserIds) {
        if (peerId > 0 && peerId !== userId) ids.add(peerId);
      }
    }
    return [...ids];
  }, [acceptedUserIds, callerId, userId, session?.channel, session?.engineActive, session?.isIncoming, inviteeUserIds]);

  /** Start WebRTC only after the other person accepts (WhatsApp-style). */
  const remotePartyAccepted = useMemo(
    () =>
      isRemotePartyAccepted(userId, acceptedUserIds, {
        isIncoming: session?.isIncoming,
        engineActive: session?.engineActive,
        ringing: session?.ringing,
        acceptedCount,
      }),
    [userId, session?.isIncoming, session?.engineActive, session?.ringing, acceptedUserIds, acceptedCount],
  );

  useEffect(() => {
    if (!session?.callId || session.isIncoming || session.ringing) return;
    if (remotePartyAccepted && session.channel && !session.engineActive) {
      // FIX: Also update the ref immediately so webrtcReady computes true
      // in the same synchronous pass, avoiding a one-render delay.
      sessionEngineActiveRef.current = true;
      setSession((prev) => (prev?.callId === session.callId ? { ...prev, engineActive: true } : prev));
    }
  }, [session?.callId, session?.isIncoming, session?.ringing, session?.channel, session?.engineActive, remotePartyAccepted]);

  const onCallUserIds = useMemo(() => {
    const ids = new Set<number>(inviteeUserIds);
    if (callerId) ids.add(callerId);
    if (userId) ids.add(userId);
    return [...ids];
  }, [inviteeUserIds, callerId, userId]);

  /** Videh call initiator — must be set before WebRTC starts (wrong id = no audio). */
  const callInitiatorId = session?.isIncoming
    ? (session.callerUserId ?? (callerId && callerId !== userId ? callerId : 0))
    : userId;
  /** WebRTC starts only after the other party accepts — avoids orphan offers and negotiate races. */
  const webrtcReady = Boolean(
    session?.engineActive
    && session.channel
    && callInitiatorId > 0
    && remotePartyAccepted,
  );
  const engineChannel = webrtcReady ? session!.channel : "";
  const call = useVidehCall(
    engineChannel,
    userId,
    session?.isVideo ?? false,
    webrtcReady ? remotePeerIds : [],
    user?.sessionToken,
    callInitiatorId,
    session?.callId ?? null,
    negotiateBump,
  );

  const resetLocalCallMedia = useCallback(async () => {
    await call.leave().catch(() => {});
    outgoingCallInitRef.current = null;
  }, [call]);

  const bumpNegotiation = useCallback((forCallId: string) => {
    if (!forCallId || negotiateBumpedForCallRef.current === forCallId) return;
    negotiateBumpedForCallRef.current = forCallId;
    setNegotiateBump((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!session?.callId) return;
    callDebug("WEBRTC_GATE", {
      callId: session.callId,
      webrtcReady,
      engineActive: session.engineActive,
      remotePartyAccepted,
      callInitiatorId,
      channel: session.channel,
      isIncoming: session.isIncoming,
    });
  }, [session?.callId, session?.engineActive, session?.channel, session?.isIncoming, webrtcReady, remotePartyAccepted, callInitiatorId]);

  const resetCallParticipantState = useCallback(() => {
    setParticipantCount(2);
    setAcceptedCount(0);
    setRingingCount(0);
    setAcceptedUserIds([]);
    setCallerId(null);
    setInviteeUserIds([]);
    statusPollMissRef.current = 0;
  }, []);

  const clearSession = useCallback(() => {
    setSession(null);
    setDuration(0);
    setStatusHint(null);
    endedTonePlayed.current = false;
    endingCallRef.current = false;
    outgoingCallInitRef.current = null;
    busyEndHandledRef.current = null;
    negotiateBumpedForCallRef.current = null;
    // FIX: Also clear the engine active ref so the next call starts clean.
    sessionEngineActiveRef.current = false;
    sessionRingingRef.current = false;
    if (dismissedCallIdsRef.current.size > 48) {
      dismissedCallIdsRef.current = new Set([...dismissedCallIdsRef.current].slice(-24));
    }
    resetCallParticipantState();
    resetCallNavigationGuard();
    setCallOutcome(null);
    setOutcomeSnapshot(null);
  }, [resetCallParticipantState]);

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
      if (endingCallRef.current) return;
      endingCallRef.current = true;
      try {
        dismissedCallIdsRef.current.add(id);
        requestDismissIncomingCallUi(id, true);
        await stopCallAlert();
        await dismissIncomingCallNotification(id).catch(() => {});
        endCallKeep(id, "declined");
        clearSession();
        if (sessionEngineActiveRef.current || sessionRingingRef.current) leaveCallScreen();
      } finally {
        endingCallRef.current = false;
      }
    },
    [clearSession, leaveCallScreen],
  );

  const teardownCallLocally = useCallback(
    async (endedCallId?: string, opts?: { skipServerEnd?: boolean }) => {
      const id = endedCallId ?? sessionCallIdRef.current ?? undefined;
      const activeCallId = sessionCallIdRef.current;
      const targetsActiveCall = !activeCallId || !id || activeCallId === id;
      const shouldLeaveUi = targetsActiveCall && (sessionEngineActiveRef.current || sessionRingingRef.current);
      if (id) dismissedCallIdsRef.current.add(id);
      requestDismissIncomingCallUi(id);
      if (id && teardownInFlightRef.current.has(id)) {
        if (!opts?.skipServerEnd) {
          await webrtcFetch(`/calls/${id}/end`, user?.sessionToken, { method: "POST" }).catch(() => {});
        }
        if (targetsActiveCall) {
          clearSession();
          if (shouldLeaveUi) leaveCallScreen();
        }
        return;
      }
      if (id) teardownInFlightRef.current.add(id);
      endingCallRef.current = true;
      try {
        await stopCallAlert();
        if (targetsActiveCall) setVideoCallPipEnabled(false);
        if (id) {
          endCallKeep(id);
          if (!opts?.skipServerEnd) {
            await webrtcFetch(`/calls/${id}/end`, user?.sessionToken, { method: "POST" }).catch(() => {});
          }
        }
        if (targetsActiveCall) {
          if (shouldLeaveUi) await call.leave();
          void refreshCallLogs();
          clearSession();
          setHeldSession(null);
          if (shouldLeaveUi) leaveCallScreen();
        }
      } finally {
        endingCallRef.current = false;
        if (id) teardownInFlightRef.current.delete(id);
      }
    },
    [call, user?.sessionToken, clearSession, refreshCallLogs, leaveCallScreen],
  );

  const onCallEnded = useCallback(() => {
    void teardownCallLocally();
  }, [teardownCallLocally]);

  const showUnreachableOutcome = useCallback(
    async (outcome: CallOutcome) => {
      const snap = session;
      if (!snap || snap.isIncoming || snap.ringing) {
        void teardownCallLocally();
        return;
      }
      if (call.joined || call.connectionPhase === "connected") {
        void teardownCallLocally(undefined, { skipServerEnd: true });
        return;
      }
      await stopCallAlert();
      await call.leave();
      setOutcomeSnapshot({
        contactName: snap.contactName,
        chatId: snap.chatId,
        isVideo: snap.isVideo,
      });
      setCallOutcome(outcome);
      sessionEngineActiveRef.current = false;
      setSession((prev) => (prev ? { ...prev, engineActive: false } : prev));
      void refreshCallLogs();
    },
    [session, call, teardownCallLocally, refreshCallLogs],
  );

  const dismissCallOutcome = useCallback(() => {
    setCallOutcome(null);
    setOutcomeSnapshot(null);
    clearSession();
    leaveCallScreen();
  }, [clearSession, leaveCallScreen]);

  const redialFromOutcome = useCallback(() => {
    const snap = outcomeSnapshot;
    if (!snap) return;
    setCallOutcome(null);
    setOutcomeSnapshot(null);
    endedTonePlayed.current = false;
    busyEndHandledRef.current = null;
    outgoingCallInitRef.current = null;
    clearSession();
    router.replace({
      pathname: "/call/[id]",
      params: {
        id: snap.chatId,
        name: snap.contactName,
        type: snap.isVideo ? "video" : "audio",
        incoming: "0",
        ringing: "0",
      },
    });
  }, [outcomeSnapshot, clearSession, router]);

  /** Overlay / ring UI dismiss — skip if an active in-call session is running. */
  const handleUiDismissRequest = useCallback(
    (callId?: string) => {
      const id = callId ?? sessionCallIdRef.current ?? undefined;
      if (!id) return;
      if (!sessionCallIdRef.current) return;
      if (sessionCallIdRef.current !== id) return;
      if (sessionEngineActiveRef.current && !sessionRingingRef.current) {
        callDebug("CALL_DISMISS_SKIPPED_ACTIVE", { callId: id });
        return;
      }
      if (sessionRingingRef.current) {
        void dismissIncomingRinging(id);
        return;
      }
      void teardownCallLocally(id, { skipServerEnd: true });
    },
    [dismissIncomingRinging, teardownCallLocally],
  );

  /** Server says call ended — always tear down, even mid-call. */
  const handleServerCallEnded = useCallback(
    (callId?: string) => {
      const id = callId ?? sessionCallIdRef.current ?? undefined;
      if (!id) return;
      if (sessionCallIdRef.current && sessionCallIdRef.current !== id) return;
      callDebug("CALL_SERVER_ENDED", { callId: id });
      void teardownCallLocally(id, { skipServerEnd: true });
    },
    [teardownCallLocally],
  );

  const pushCallRoute = useCallback((s: CallSession, replace = false, routeCallerId?: number) => {
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
        ...(routeCallerId && routeCallerId > 0 ? { callerId: String(routeCallerId) } : {}),
      },
    };
    if (replace) router.replace(route);
    else router.push(route);
  }, [router]);

  const endCall = useCallback(async () => {
    const endingCallId = session?.callId || sessionCallIdRef.current;
    if (!endingCallId) {
      clearSession();
      leaveCallScreen();
      return;
    }
    // Always end on server first so a stuck local teardown cannot leave a ghost "line busy" call.
    await webrtcFetch(`/calls/${endingCallId}/end`, user?.sessionToken, { method: "POST" }).catch(() => {});
    await teardownCallLocally(endingCallId, { skipServerEnd: true });
  }, [session?.callId, user?.sessionToken, teardownCallLocally, clearSession, leaveCallScreen]);

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
    if (!callInfo.callerId || callInfo.callerId <= 0) return;
    if (user?.dbId && isCallCaller(user.dbId, callInfo.callerId)) return;
    wakeScreenForIncomingCall();
    resetCallParticipantState();
    if (callInfo.callerId) setCallerId(callInfo.callerId);
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
    pushCallRoute(next, false, callInfo.callerId);
  }, [pushCallRoute, resetCallParticipantState, user?.dbId]);

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
    const routeCallerId = Number(params.callerId);
    if (isIncoming && Number.isFinite(routeCallerId) && routeCallerId > 0) {
      setCallerId(routeCallerId);
    }

    setSession((prev) => {
      if (prev?.callId && params.callId && prev.callId === params.callId) {
        const next = {
          ...prev,
          minimized: false,
          contactName: params.name ?? prev.contactName,
        };
        if (!prev.isIncoming) {
          return { ...next, isIncoming: false, ringing: false };
        }
        if (params.incoming !== "1") {
          return { ...next, isIncoming: false, ringing: false };
        }
        if (prev.engineActive) {
          return { ...next, isIncoming: true, ringing: false };
        }
        return { ...next, isIncoming: true, ringing: params.ringing === "1" };
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
      if (outgoingCallInitRef.current === outgoingKey && sessionCallIdRef.current) return;
      outgoingCallInitRef.current = outgoingKey;

      void (async () => {
        // FIX: Clear any lingering stale call from previous session before dialing.
        const lingerId = sessionCallIdRef.current;
        if (lingerId) {
          await webrtcFetch(`/calls/${lingerId}/end`, user.sessionToken, { method: "POST" }).catch(() => {});
        }
        await resetLocalCallMedia();

        const res = await videhSignalingPost(
          "/calls",
          { chatId: Number(chatId), type: isVideo ? "video" : "audio" },
          user.sessionToken,
          { timeoutMs: 45000, retries: 3 },
        );
        const data = (await res.json()) as {
          success?: boolean;
          message?: string;
          allInviteesBusy?: boolean;
          participantIds?: number[];
          call?: { channel?: string; callId?: string; participantCount?: number; acceptedCount?: number; ringingCount?: number };
        };
        if (!data.success || !data.call?.channel) {
          outgoingCallInitRef.current = null;
          if (data.message) setStatusHint(data.message);
          return;
        }
        if (data.call?.callId) sessionCallIdRef.current = data.call.callId;
        negotiateBumpedForCallRef.current = null;
        if (user.dbId) setCallerId(user.dbId);
        if (Array.isArray(data.participantIds)) setInviteeUserIds(data.participantIds);
        setSession((prev) => {
          if (!prev || prev.chatId !== chatId) return prev;
          return {
            ...prev,
            channel: data.call!.channel!,
            callId: data.call!.callId ?? prev.callId,
            isIncoming: false,
            ringing: false,
            engineActive: false,
          };
        });
        setParticipantCount(data.call!.participantCount ?? 2);
        setAcceptedCount(data.call!.acceptedCount ?? 0);
        setRingingCount(data.call!.ringingCount ?? 0);
        if (data.allInviteesBusy) {
          void (async () => {
            if (busyEndHandledRef.current === data.call?.callId) return;
            busyEndHandledRef.current = data.call?.callId ?? "busy";
            await stopCallAlert();
            await playCallBusyTone();
            void showUnreachableOutcome("busy");
          })();
        }
      })().catch(() => {
        outgoingCallInitRef.current = null;
      });
    }
  }, [user?.dbId, user?.sessionToken, onCallEnded, leaveCallScreen, resetLocalCallMedia, showUnreachableOutcome]);

  const acceptIncoming = useCallback(async (callInfo?: IncomingCallInfo) => {
    const callId = callInfo?.callId ?? session?.callId;
    if (!callId || !user?.dbId) throw new Error("Missing call session");

    callDebug("CALL_ACCEPT_START", { callId, userId: user.dbId, callerId: callInfo?.callerId });

    await resetLocalCallMedia();
    await stopIncomingCallExperience(callId);
    await stopCallAlert();

    const res = await videhSignalingPost(
      `/calls/${callId}/respond`,
      { userId: user.dbId, action: "accept" },
      user.sessionToken,
      { timeoutMs: 45000, retries: 3 },
    );
    const data = (await res.json()) as {
      success?: boolean;
      message?: string;
      busy?: boolean;
      callerId?: number;
      // FIX: Server now returns acceptedUserIds directly in respond response.
      acceptedUserIds?: number[];
      acceptedCount?: number;
      call?: {
        channel?: string;
        chatId?: number;
        type?: string;
        callerName?: string;
        callerId?: number;
        acceptedCount?: number;
        acceptedUserIds?: number[];
      };
    };
    if (!res.ok || !data.success) {
      const msg = data.message ?? "Could not accept call";
      throw new Error(/not found|expired|no longer ringing/i.test(msg)
        ? "Call expired — ask them to call again."
        : msg);
    }
    if (data.busy) {
      throw new Error("You are already on another call");
    }

    let resolvedCallerId = Number(data.callerId ?? data.call?.callerId ?? callInfo?.callerId ?? 0);
    let channel = String(data.call?.channel ?? callInfo?.channel ?? session?.channel ?? "").trim();
    let chatId = Number(data.call?.chatId ?? callInfo?.chatId ?? session?.chatId ?? 0);
    let callerName = String(data.call?.callerName ?? callInfo?.callerName ?? session?.contactName ?? "Contact");
    const isVideo = (data.call?.type ?? callInfo?.type ?? (session?.isVideo ? "video" : "audio")) === "video";

    if (!channel || !resolvedCallerId) {
      const details = await fetchIncomingCallDetails(callId, user.dbId, user.sessionToken);
      if (details) {
        channel = channel || details.channel.trim();
        chatId = chatId || details.chatId;
        callerName = callerName || details.callerName;
        if (!resolvedCallerId && details.callerId) resolvedCallerId = details.callerId;
      }
    }

    if (!channel) throw new Error("Call channel unavailable");
    if (!resolvedCallerId || resolvedCallerId <= 0) {
      throw new Error("Could not identify caller");
    }
    if (resolvedCallerId === user.dbId) {
      throw new Error("Cannot accept your own call");
    }

    // FIX: Use acceptedUserIds from top-level response first (new field),
    // then fall back to call.acceptedUserIds for backward compatibility.
    const serverAcceptedUserIds = data.acceptedUserIds ?? data.call?.acceptedUserIds ?? [];
    const serverAcceptedCount = data.acceptedCount ?? data.call?.acceptedCount ?? 0;

    if (serverAcceptedCount > 0) {
      setAcceptedCount(serverAcceptedCount);
    }
    if (serverAcceptedUserIds.length > 0) {
      setAcceptedUserIds(serverAcceptedUserIds);
    }

    callDebug("CALL_ACCEPTED", { callId, userId: user.dbId, callerId: resolvedCallerId, channel, serverAcceptedUserIds });

    setCallerId(resolvedCallerId);
    // FIX: Set acceptedUserIds to include both this user and the caller immediately.
    // This ensures remotePartyAccepted becomes true before setSession(engineActive:true)
    // so webrtcReady is true in the very next render.
    setAcceptedUserIds((prev) => {
      const ids = new Set([...prev, ...serverAcceptedUserIds]);
      ids.add(user.dbId!);
      if (resolvedCallerId > 0) ids.add(resolvedCallerId);
      return [...ids];
    });
    setAcceptedCount((prev) => Math.max(prev, serverAcceptedCount > 0 ? serverAcceptedCount : 2));
    dismissedCallIdsRef.current.delete(callId);
    negotiateBumpedForCallRef.current = null;
    sessionRingingRef.current = false;
    // FIX: Set ref immediately before setSession so that if any effect fires
    // synchronously, it sees the correct engineActive state.
    sessionEngineActiveRef.current = true;

    const next: CallSession = {
      chatId: String(chatId || session?.chatId || ""),
      contactName: callerName,
      isVideo,
      channel,
      callId,
      isIncoming: true,
      ringing: false,
      minimized: false,
      engineActive: true,
      callerUserId: resolvedCallerId,
    };
    setSession(next);
    callDebug("OPENING_CALL_SCREEN", { callId, chatId: next.chatId, incoming: true, replace: true });
    pushCallRoute(next, true, resolvedCallerId);
  }, [session?.callId, session?.chatId, session?.contactName, session?.channel, session?.isVideo, user?.dbId, user?.sessionToken, pushCallRoute, resetLocalCallMedia, bumpNegotiation]);

  const declineIncoming = useCallback(async (declineMessage?: string) => {
    const callId = session?.callId;
    if (!callId || !user?.dbId) return;
    dismissedCallIdsRef.current.add(callId);
    await rejectIncomingCall({
      callId,
      userId: user.dbId,
      sessionToken: user.sessionToken,
      declineMessage,
    });
    void refreshCallLogs();
    await dismissIncomingRinging(callId);
  }, [
    session?.callId,
    user?.dbId,
    user?.sessionToken,
    dismissIncomingRinging,
    refreshCallLogs,
  ]);

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
    if (call.joined || remotePartyAccepted) {
      void stopCallAlert();
      return;
    }
    void startOutgoingRingback();
    const timeout = setTimeout(() => {
      void (async () => {
        if (call.joined || remotePartyAccepted) return;
        await stopCallAlert();
        await playCallUnavailableTone();
        if (session.callId) {
          await webrtcFetch(`/calls/${session.callId}/end`, user?.sessionToken, { method: "POST" }).catch(() => {});
        }
        void showUnreachableOutcome("no_answer");
      })();
    }, INCOMING_RING_TIMEOUT_MS);
    return () => {
      clearTimeout(timeout);
      void stopCallAlert();
    };
  }, [session?.callId, session?.isIncoming, session?.ringing, call.joined, remotePartyAccepted, acceptedCount, user?.sessionToken, showUnreachableOutcome]);

  useEffect(() => {
    if (!session?.callId || !userId || session.ringing) return;
    // Outgoing calls: poll from ring until callee accepts (engineActive may still be false).
    // Incoming calls: poll only after accept (engineActive true).
    if (session.isIncoming && !session.engineActive) return;
    const polledCallId = session.callId;
    statusPollMissRef.current = 0;
    const pollMs = call.joined ? 800 : session.engineActive ? 500 : 400;
    const missLimit = call.joined ? 6 : 4;
    const timer = setInterval(() => {
      void webrtcFetch(`/calls/${polledCallId}/status?userId=${userId}`, user?.sessionToken)
        .then(async (res) => {
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
          if (sessionCallIdRef.current !== polledCallId) return;
          if (!data.success || res.status === 404) {
            statusPollMissRef.current += 1;
            if (statusPollMissRef.current >= missLimit) {
              handleServerCallEnded(polledCallId);
            }
            return;
          }
          statusPollMissRef.current = 0;
          if (endingCallRef.current) return;
          setAcceptedCount(data.acceptedCount ?? 1);
          setRingingCount(data.ringingCount ?? 0);
          setParticipantCount((prev) => data.call?.participantCount ?? prev);
          const polledAcceptedIds = Array.isArray(data.acceptedUserIds) ? data.acceptedUserIds : [];
          if (polledAcceptedIds.length > 0) setAcceptedUserIds(polledAcceptedIds);
          if (typeof data.callerId === "number") setCallerId(data.callerId);
          if (data.statuses && typeof data.statuses === "object") {
            setInviteeUserIds(
              Object.keys(data.statuses)
                .map((k) => Number(k))
                .filter((id) => Number.isFinite(id)),
            );
          }

          const remoteAccepted =
            polledAcceptedIds.some((id) => id !== userId) || (data.acceptedCount ?? 1) > 1;
          if (remoteAccepted) {
            void stopCallAlert();
            setStatusHint(null);
            if (!sessionEngineActiveRef.current && sessionCallIdRef.current === polledCallId) {
              // FIX: Set ref first, then state — prevents the old "one render delay"
              // that caused webrtcReady to be false for one extra render cycle.
              sessionEngineActiveRef.current = true;
              setSession((prev) =>
                prev?.callId === polledCallId && !prev.engineActive
                  ? { ...prev, engineActive: true }
                  : prev,
              );
            }
          } else if (!call.joined) {
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
                  void showUnreachableOutcome("busy");
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
                  void showUnreachableOutcome("declined");
                } catch { /* ignore */ }
              })();
              return;
            }
            if ((data.missedCount ?? 0) > 0 && (data.ringingCount ?? 0) === 0 && !remoteAccepted) {
              if (busyEndHandledRef.current === polledCallId) return;
              busyEndHandledRef.current = polledCallId;
              endedTonePlayed.current = true;
              void (async () => {
                try {
                  await stopCallAlert();
                  await playCallUnavailableTone();
                  void showUnreachableOutcome("no_answer");
                } catch { /* ignore */ }
              })();
              return;
            }
          }

          if (data.ended) {
            void stopCallAlert();
            handleServerCallEnded(polledCallId);
          }
        })
        .catch(() => {});
    }, pollMs);
    return () => clearInterval(timer);
  }, [session?.callId, session?.engineActive, session?.isIncoming, session?.ringing, userId, call.joined, user?.sessionToken, onCallEnded, handleServerCallEnded, showUnreachableOutcome, bumpNegotiation]);

  useEffect(() => {
    if (!session?.callId || !session.engineActive || session.ringing || call.joined) return;
    if (!remotePartyAccepted) return;
    const callId = session.callId;
    const timer = setTimeout(() => {
      if (sessionCallIdRef.current !== callId || endingCallRef.current) return;
      callDebug("CONNECTING_TIMEOUT", { callId });
      void (async () => {
        await webrtcFetch(`/calls/${callId}/end`, user?.sessionToken, { method: "POST" }).catch(() => {});
        setStatusHint("Could not connect — check internet and try again.");
        await playCallUnavailableTone();
        void teardownCallLocally(callId, { skipServerEnd: true });
      })();
    }, CONNECTING_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [session?.callId, session?.engineActive, session?.ringing, remotePartyAccepted, call.joined, user?.sessionToken, teardownCallLocally]);

  const callAnswered = call.connectionPhase === "connected";

  useEffect(() => {
    if (call.connectionPhase !== "connected") {
      setDuration(0);
      return;
    }
    const t = setInterval(() => setDuration((d) => d + 1), 1000);
    return () => clearInterval(t);
  }, [call.connectionPhase]);

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
      const signal = resolveCallSignal(payload as Record<string, unknown>);
      const action = signal.action ?? "";
      const callId = signal.callId ?? "";
      if (
        callId
        && (action === "ended" || action === "declined" || action === "missed" || action === "busy" || action === "cancelled")
      ) {
        if (
          (action === "missed" || action === "cancelled")
          && sessionEngineActiveRef.current
          && sessionCallIdRef.current === callId
          && !sessionRingingRef.current
        ) {
          return;
        }
        handleServerCallEnded(callId);
        return;
      }
      if (action === "accepted" && callId && sessionCallIdRef.current === callId) {
        void stopCallAlert();
        if (typeof signal.acceptedCount === "number") {
          setAcceptedCount(signal.acceptedCount);
        }
        // FIX: acceptedUserIds now comes directly in the SSE payload (we added it
        // to publishCallSignal in webrtc.ts). Use it to immediately unblock WebRTC.
        if (Array.isArray(signal.acceptedUserIds) && signal.acceptedUserIds.length > 0) {
          setAcceptedUserIds(signal.acceptedUserIds);
        } else if ((signal.acceptedCount ?? 0) > 0 && userId) {
          setAcceptedUserIds((prev) => {
            const ids = new Set(prev);
            ids.add(userId);
            if (typeof signal.callerId === "number" && signal.callerId > 0) ids.add(signal.callerId);
            return [...ids];
          });
        }
        if (typeof signal.callerId === "number" && signal.callerId > 0) {
          setCallerId(signal.callerId);
        }
        callDebug("CALL_ACCEPTED_SSE", {
          callId,
          via: "sse",
          userId,
          acceptedUserIds: signal.acceptedUserIds,
          acceptedCount: signal.acceptedCount,
        });
        setSession((prev) => {
          if (!prev || prev.callId !== callId) return prev;
          if (prev.isIncoming && prev.ringing) return prev;
          // FIX: Set ref before state update.
          sessionEngineActiveRef.current = true;
          sessionRingingRef.current = false;
          return prev.engineActive ? prev : { ...prev, engineActive: true, ringing: false };
        });
        return;
      }
      if (action !== "media_type") return;
      const raw = payload as { type?: string; payload?: { type?: string } };
      const nextVideo = (raw.type ?? raw.payload?.type) === "video";
      setSession((prev) => (prev ? { ...prev, isVideo: nextVideo } : prev));
    });
    return unsub;
  }, [handleServerCallEnded, userId, bumpNegotiation]);

  useEffect(() => registerCallSessionDismissHandler(handleUiDismissRequest), [handleUiDismissRequest]);
  useEffect(() => registerCallSessionEndHandler(handleServerCallEnded), [handleServerCallEnded]);

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
    if (callAnswered) {
      return formatDuration(duration);
    }
    if (call.connectionPhase === "reconnecting") {
      return "Reconnecting…";
    }
    if (call.joined || remotePartyAccepted) {
      if (statusHint) return statusHint;
      return "Connecting…";
    }
    if (call.error) {
      return call.error === "NATIVE_WEBRTC_UNAVAILABLE" ? "Connecting..." : `Error: ${call.error}`;
    }
    if (statusHint) return statusHint;
    if (session.isIncoming) return session.isVideo ? "Incoming video call" : "Incoming voice call";
    if (ringingCount > 1) return `Ringing ${ringingCount} people...`;
    return session.isVideo ? "Calling…" : "Ringing…";
  }, [session, call, duration, statusHint, acceptedCount, ringingCount, callAnswered, remotePartyAccepted]);

  const value = useMemo<CallSessionContextValue>(
    () => ({
      session,
      joined: call.joined,
      mediaReady: call.mediaReady,
      callAnswered,
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
      callOutcome,
      outcomeSnapshot,
      dismissCallOutcome,
      redialFromOutcome,
    }),
    [
      session,
      call,
      duration,
      statusText,
      participantCount,
      acceptedCount,
      ringingCount,
      callOutcome,
      outcomeSnapshot,
      dismissCallOutcome,
      redialFromOutcome,
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
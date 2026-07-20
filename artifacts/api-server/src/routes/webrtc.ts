import { Router, type Request, type Response } from "express";
import { assertSameUser, requireAuth } from "../lib/auth";
import { insertCallChatMessage, publishCallSignal } from "../lib/callMessages";
import { query } from "../lib/db";
import { publishChatEvent } from "../lib/realtime";
import { EXPO_INCOMING_CALL_CATEGORY_ID } from "../lib/expoPush";
import { isValidPushToken, sendChatPush } from "../lib/pushNotify";
import { clientIp, isRateLimited } from "../lib/rateLimit";
import { stateDelete, stateGetJson, stateKeys, stateSetJson } from "../lib/sharedState";
import { getIceServers } from "../lib/webrtcIce";

type Role = "caller" | "callee";
type SignalSession = {
  channel: string;
  type: "audio" | "video";
  callerId: number;
  calleeId?: number;
  offer?: unknown;
  answer?: unknown;
  offerRevision?: number;
  answerRevision?: number;
  callerCandidates: unknown[];
  calleeCandidates: unknown[];
  createdAt: number;
  updatedAt: number;
};
type CallInvite = {
  callId: string;
  channel: string;
  chatId: number;
  type: "audio" | "video";
  callerId: number;
  callerName: string | null;
  participantIds: number[];
  statuses: Record<number, "ringing" | "calling" | "accepted" | "declined" | "missed" | "ended" | "busy">;
  createdAt: number;
  updatedAt: number;
  connectedAt?: number;
  logged?: boolean;
  holdByUser?: Record<number, boolean>;
};

const router = Router();
router.use(requireAuth);
router.get("/ice-config", (_req: Request, res: Response) => {
  res.json({ success: true, iceServers: getIceServers() });
});
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
/** Keep in sync with videh `INCOMING_RING_TIMEOUT_MS` (45s). */
const RING_TIMEOUT_MS = 45 * 1000;
/**
 * FIX: Was 90s — too long. A ghost "accepted-but-no-WebRTC" call would block
 * the next dial for 90 seconds. 30s is enough: WebRTC connects in <10s on good
 * networks, and 30s covers poor connections without blocking repeat calls.
 */
const NEGOTIATE_IDLE_MS = 30 * 1000;
/** Connected calls stay alive while clients poll status; orphan after brief silence (crash / force-quit). */
const CONNECTED_CALL_IDLE_MS = 2 * 60 * 1000;
const ringExpiryTimers = new Map<string, ReturnType<typeof setTimeout>>();
/**
 * Ring reminders over SSE only when the app is connected; push is for background devices.
 * 8s avoids notification spam while keeping backup delivery.
 */
const RING_REMINDER_MS = 8_000;
const ringReminderTimers = new Map<string, ReturnType<typeof setInterval>>();

function callIsOnHold(call: CallInvite): boolean {
  return Boolean(call.holdByUser && Object.values(call.holdByUser).some(Boolean));
}

function callIsOrphanStale(call: CallInvite): boolean {
  if (isCallEnded(call)) return true;
  // Held calls stop status heartbeats — do not auto-finalize while on hold.
  if (callIsOnHold(call)) return false;
  const idleMs = Date.now() - call.updatedAt;
  if (!call.connectedAt) {
    const accepted = Object.values(call.statuses).some((s) => s === "accepted");
    if (accepted) return idleMs > NEGOTIATE_IDLE_MS;
    // Fresh rings use createdAt so status polls cannot keep a dead ring alive forever.
    return Date.now() - call.createdAt > RING_TIMEOUT_MS;
  }
  return idleMs > CONNECTED_CALL_IDLE_MS;
}

/**
 * Accepted but never connected after idle — safe to release.
 * Fresh ringing/calling invites must NOT be treated as ghosts.
 */
function isNegotiateGhost(call: CallInvite): boolean {
  if (call.connectedAt || isCallEnded(call) || callIsOnHold(call)) return false;
  const accepted = Object.values(call.statuses).some((s) => s === "accepted");
  if (!accepted) return false;
  return Date.now() - call.updatedAt > NEGOTIATE_IDLE_MS;
}

function shouldReleaseCallForUser(call: CallInvite, userId: number): boolean {
  if (!isCallParticipant(call, userId)) return false;
  if (callIsOnHold(call) && call.connectedAt) return false;
  const status = call.statuses[userId];
  if (!status || status === "declined" || status === "missed" || status === "ended" || status === "busy") {
    return false;
  }
  if (callIsOrphanStale(call)) return true;
  if (isNegotiateGhost(call)) return true;
  return false;
}

function authUid(req: Request): number {
  return Number((req as any).authUserId) || 0;
}

/** Bind signaling channel to an authenticated call participant. */
async function requireSessionAccess(
  req: Request,
  res: Response,
  channel: string,
): Promise<{ session: SignalSession; call: CallInvite; userId: number; role: Role } | null> {
  const userId = authUid(req);
  if (!userId) {
    res.status(401).json({ success: false, message: "Authentication required" });
    return null;
  }
  const session = await getSession(channel);
  if (!session) {
    res.status(404).json({ success: false, message: "Call session not found." });
    return null;
  }
  const call = await findCallByChannel(channel);
  if (!call || !isCallParticipant(call, userId)) {
    res.status(403).json({ success: false, message: "Not a call participant." });
    return null;
  }
  const role: Role = session.callerId === userId ? "caller" : "callee";
  if (role === "callee" && session.calleeId && session.calleeId !== userId && call.callerId !== userId) {
    // Allow any invitee as callee on 1:1 mesh; must be on the invite.
    if (!call.participantIds.includes(userId)) {
      res.status(403).json({ success: false, message: "Not a call participant." });
      return null;
    }
  }
  return { session, call, userId, role };
}

function clearRingExpiryTimer(callId: string): void {
  const t = ringExpiryTimers.get(callId);
  if (t) {
    clearTimeout(t);
    ringExpiryTimers.delete(callId);
  }
  clearRingReminderTimers(callId);
}

function clearRingReminderTimers(callId: string): void {
  const t = ringReminderTimers.get(callId);
  if (t) {
    clearInterval(t);
    ringReminderTimers.delete(callId);
  }
}

function userIdsNeedingCallPush(userIds: number[]): number[] {
  // Always send call pushes — SSE can still be "connected" while the app is backgrounded
  // or the screen is locked, and JS cannot show lock-screen UI / ringtone without a
  // system notification. Client dedupes via shouldPresentIncomingCallSurfaces.
  return userIds;
}

async function sendRingReminder(callId: string): Promise<void> {
  const call = await getCall(callId);
  if (!call) {
    clearRingReminderTimers(callId);
    return;
  }
  const ringingIds = call.participantIds.filter((id) => call.statuses[id] === "ringing");
  if (ringingIds.length === 0) {
    clearRingReminderTimers(callId);
    return;
  }
  call.updatedAt = Date.now();
  await saveCall(call);
  publishCallSignal({
    chatId: call.chatId,
    userIds: ringingIds,
    action: "ringing",
    payload: {
      ...serializeIncoming(call, call.callerId),
      callerId: call.callerId,
      action: "ringing",
    },
  });
  try {
    const members = await query(
      `SELECT cm.user_id, u.push_token FROM chat_members cm
       JOIN users u ON u.id = cm.user_id WHERE cm.chat_id = $1`,
      [call.chatId],
    );
    const pushUserIds = userIdsNeedingCallPush(ringingIds);
    const { shouldSendPushForKind } = await import("../lib/notificationPrefs");
    const pushTokens: string[] = [];
    for (const row of members.rows as { user_id: number; push_token: string | null }[]) {
      if (!pushUserIds.includes(Number(row.user_id))) continue;
      if (!(await shouldSendPushForKind(Number(row.user_id), "calls"))) continue;
      if (isValidPushToken(row.push_token)) pushTokens.push(row.push_token!);
    }
    if (pushTokens.length > 0) {
      await sendChatPush(
        pushTokens,
        call.type === "video" ? "Video call" : "Voice call",
        `${call.callerName ?? "Videh user"} is calling`,
        {
          callId: call.callId,
          chatId: String(call.chatId),
          type: call.type,
          channel: call.channel,
          callerId: String(call.callerId),
          callerName: call.callerName ?? "Videh user",
          kind: "call",
          notificationKind: "incoming_call",
        },
        { categoryId: EXPO_INCOMING_CALL_CATEGORY_ID, threadId: `call-${call.callId}`, isCall: true },
      );
    }
  } catch (err) {
    console.error("ring reminder push", err);
  }
}

function scheduleRingReminders(callId: string): void {
  clearRingReminderTimers(callId);
  ringReminderTimers.set(
    callId,
    setInterval(() => {
      void sendRingReminder(callId);
    }, RING_REMINDER_MS),
  );
}

async function expireRingingCall(callId: string): Promise<void> {
  ringExpiryTimers.delete(callId);
  const call = await getCall(callId);
  if (!call) return;
  let changed = false;
  for (const uid of call.participantIds) {
    if (call.statuses[uid] === "ringing") {
      call.statuses[uid] = "missed";
      changed = true;
    }
  }
  if (!changed) {
    clearRingExpiryTimer(callId);
    return;
  }
  call.updatedAt = Date.now();
  publishCallSignal({
    chatId: call.chatId,
    userIds: [call.callerId, ...call.participantIds],
    action: "missed",
    payload: {
      callId: call.callId,
      chatId: call.chatId,
      type: call.type,
      channel: call.channel,
    },
  });
  if (isCallEnded(call)) await finalizeCall(call);
  else await saveCall(call);
}

function scheduleRingExpiry(callId: string): void {
  clearRingExpiryTimer(callId);
  ringExpiryTimers.set(
    callId,
    setTimeout(() => {
      void expireRingingCall(callId);
    }, RING_TIMEOUT_MS),
  );
}
const sessionKey = (channel: string) => `webrtc:session:${channel}`;
const callKey = (callId: string) => `webrtc:call:${callId}`;
const channelIndexKey = (channel: string) => `webrtc:channel:${channel}`;
const chatIndexKey = (chatId: number) => `webrtc:chat:${chatId}`;

async function getSession(channel: string): Promise<SignalSession | null> {
  return stateGetJson<SignalSession>(sessionKey(channel));
}

async function saveSession(session: SignalSession): Promise<void> {
  await stateSetJson(sessionKey(session.channel), session, SESSION_TTL_MS);
}

async function getCall(callId: string): Promise<CallInvite | null> {
  return stateGetJson<CallInvite>(callKey(callId));
}

async function saveCall(call: CallInvite): Promise<void> {
  await stateSetJson(callKey(call.callId), call, SESSION_TTL_MS);
  await stateSetJson(channelIndexKey(call.channel), call.callId, SESSION_TTL_MS);
  await stateSetJson(chatIndexKey(call.chatId), call.callId, SESSION_TTL_MS);
}

async function findCallByChannel(channel: string): Promise<CallInvite | null> {
  const indexedId = await stateGetJson<string>(channelIndexKey(channel));
  if (indexedId) {
    const indexed = await getCall(indexedId);
    if (indexed?.channel === channel) return indexed;
  }
  // Legacy fallback for calls saved before channel index existed.
  for (const key of await stateKeys("webrtc:call:")) {
    const call = await stateGetJson<CallInvite>(key);
    if (call?.channel === channel) {
      await stateSetJson(channelIndexKey(channel), call.callId, SESSION_TTL_MS);
      return call;
    }
  }
  return null;
}

async function findLiveCallByChatId(chatId: number): Promise<CallInvite | null> {
  const indexedId = await stateGetJson<string>(chatIndexKey(chatId));
  if (indexedId) {
    const indexed = await getCall(indexedId);
    if (indexed && indexed.chatId === chatId && !isCallEnded(indexed)) return indexed;
  }
  for (const key of await stateKeys("webrtc:call:")) {
    const call = await stateGetJson<CallInvite>(key);
    if (call && call.chatId === chatId && !isCallEnded(call)) {
      await stateSetJson(chatIndexKey(chatId), call.callId, SESSION_TTL_MS);
      return call;
    }
  }
  return null;
}

async function markCallConnected(call: CallInvite): Promise<void> {
  if (call.connectedAt) return;
  call.connectedAt = Date.now();
  if (call.statuses[call.callerId] === "calling") {
    call.statuses[call.callerId] = "accepted";
  }
  call.updatedAt = Date.now();
  clearRingExpiryTimer(call.callId);
  await saveCall(call);
}

let lastCleanupAt = 0;
const CLEANUP_INTERVAL_MS = 60_000;

async function cleanupSessions() {
  const now = Date.now();
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
  lastCleanupAt = now;
  for (const key of await stateKeys("webrtc:session:")) {
    const session = await stateGetJson<SignalSession>(key);
    if (session && now - session.updatedAt > SESSION_TTL_MS) await stateDelete(key);
  }
  for (const key of await stateKeys("webrtc:call:")) {
    const call = await stateGetJson<CallInvite>(key);
    if (!call) continue;
    if (now - call.updatedAt > SESSION_TTL_MS) {
      clearRingExpiryTimer(call.callId);
      await stateDelete(key);
      continue;
    }
    if (now - call.createdAt > RING_TIMEOUT_MS) {
      let changed = false;
      for (const uid of call.participantIds) {
        if (call.statuses[uid] === "ringing") {
          call.statuses[uid] = "missed";
          changed = true;
        }
      }
      if (changed) {
        if (isCallEnded(call)) await finalizeCall(call);
        else await saveCall(call);
      }
    }
  }
}

function safeChannel(raw: unknown): string {
  return String(raw ?? "").trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
}

function isCallEnded(call: CallInvite): boolean {
  if (Object.values(call.statuses).some((status) => status === "ended")) return true;
  const invitees = call.participantIds;
  if (invitees.length === 0) return false;
  const allResolved = invitees.every((id) => {
    const status = call.statuses[id];
    return status === "accepted" || status === "declined" || status === "missed" || status === "busy";
  });
  if (!allResolved) return false;
  return !invitees.some((id) => call.statuses[id] === "accepted");
}

async function listActiveCalls(): Promise<CallInvite[]> {
  const keys = await stateKeys("webrtc:call:");
  const calls = await Promise.all(keys.map((key) => stateGetJson<CallInvite>(key)));
  return calls.filter((c): c is CallInvite => c != null && !isCallEnded(c));
}

/** Drop in-memory calls that would block new invites (crash / missed hang-up). */
async function releaseStaleCallsForUser(userId: number, exceptCallId?: string): Promise<void> {
  if (!userId) return;
  const live = await listActiveCalls();
  for (const call of live) {
    if (exceptCallId && call.callId === exceptCallId) continue;
    if (!shouldReleaseCallForUser(call, userId)) continue;
    publishCallSignal({
      chatId: call.chatId,
      userIds: [call.callerId, ...call.participantIds],
      action: "ended",
      payload: {
        callId: call.callId,
        chatId: call.chatId,
        type: call.type,
        callerId: call.callerId,
      },
    });
    await finalizeCall(call);
  }
}

/** User is already in an active call (used for busy detection). */
function userIsOnLiveCall(calls: CallInvite[], userId: number, exceptCallId?: string): boolean {
  return calls.some((call) => {
    if (exceptCallId && call.callId === exceptCallId) return false;
    if (isCallEnded(call)) return false;

    const status = call.statuses[userId];
    if (!status) return false;
    if (status === "ringing") {
      if (callIsOrphanStale(call)) return false;
      return call.callerId !== userId;
    }

    if (status === "calling") {
      return call.callerId === userId
        && call.participantIds.some((id) => {
          const peer = call.statuses[id];
          return peer === "ringing" || peer === "accepted";
        });
    }

    if (status === "accepted") {
      if (call.connectedAt) return true;
      if (isNegotiateGhost(call)) return false;
      if (Date.now() - call.updatedAt > NEGOTIATE_IDLE_MS) return false;
      if (call.callerId === userId) {
        return call.participantIds.some((id) => {
          const peer = call.statuses[id];
          return peer === "ringing" || peer === "accepted";
        });
      }
      return true;
    }

    return false;
  });
}

function isCallParticipant(call: CallInvite, userId: number): boolean {
  return call.callerId === userId || call.participantIds.includes(userId);
}

function participantCallStatus(call: CallInvite, participantId: number): string {
  const s = call.statuses[participantId];
  if (s === "busy") return "busy";
  if (s === "declined") return "declined";
  // connected call — "ended" is set on hangup after "accepted"
  if (call.connectedAt && (s === "accepted" || s === "ended")) return "answered";
  if (s === "missed" || s === "ringing") return "missed";
  return "missed";
}

function aggregateCallResult(call: CallInvite): "answered" | "missed" | "declined" | "busy" {
  const statuses = call.participantIds.map((id) => participantCallStatus(call, id));
  if (statuses.some((s) => s === "answered")) return "answered";
  if (statuses.length > 0 && statuses.every((s) => s === "busy")) return "busy";
  if (statuses.some((s) => s === "declined")) return "declined";
  return "missed";
}

async function persistCallHistory(call: CallInvite): Promise<boolean> {
  if (call.logged || call.participantIds.length === 0) return false;
  const durationSeconds = call.connectedAt
    ? Math.max(0, Math.round((Date.now() - call.connectedAt) / 1000))
    : 0;
  const result = aggregateCallResult(call);
  const startedAt = call.connectedAt ?? call.createdAt;
  const metaContent = JSON.stringify({
    callType: call.type,
    result,
    durationSeconds: durationSeconds || undefined,
  });

  try {
    const dup = await query(
      `SELECT id FROM messages
      WHERE chat_id = $1 AND type = 'call' AND content = $2
        AND created_at > NOW() - INTERVAL '15 seconds'
      LIMIT 1`,
      [call.chatId, metaContent],
    );
    if (dup.rows.length > 0) {
      call.logged = true;
      await saveCall(call);
      return false;
    }

    for (const participantId of call.participantIds) {
      const status = participantCallStatus(call, participantId);
      await query(
        `INSERT INTO calls (caller_id, callee_id, chat_id, type, status, duration_seconds, started_at, ended_at)
        VALUES ($1, $2, $3, $4, $5, $6, to_timestamp($7 / 1000.0), NOW())`,
        [call.callerId, participantId, call.chatId, call.type, status, durationSeconds, startedAt],
      );
    }
    call.logged = true;
    await saveCall(call);
    await insertCallChatMessage({
      chatId: call.chatId,
      callerId: call.callerId,
      callType: call.type,
      result,
      durationSeconds: durationSeconds || undefined,
      participantIds: call.participantIds,
    });
    publishCallSignal({
      chatId: call.chatId,
      userIds: [call.callerId, ...call.participantIds],
      action: result === "answered" ? "call_logged" : result === "declined" ? "declined" : result === "busy" ? "busy" : "missed",
      payload: {
        callId: call.callId,
        chatId: call.chatId,
        type: call.type,
        result,
        durationSeconds,
        conference: call.participantIds.length > 1,
      },
    });
    return true;
  } catch (err) {
    console.error("persistCallHistory error", err);
    return false;
  }
}

/** Write call history once and remove in-memory call so it cannot block future calls. */
async function finalizeCall(call: CallInvite): Promise<void> {
  clearRingExpiryTimer(call.callId);
  await persistCallHistory(call);
  await stateDelete(callKey(call.callId));
  await stateDelete(sessionKey(call.channel));
  await stateDelete(channelIndexKey(call.channel));
  const chatIdx = await stateGetJson<string>(chatIndexKey(call.chatId));
  if (chatIdx === call.callId) await stateDelete(chatIndexKey(call.chatId));
}

function acceptedUserIdsFromCall(call: CallInvite): number[] {
  return Object.entries(call.statuses)
    .filter(([, status]) => status === "accepted")
    .map(([id]) => Number(id))
    .filter((id) => Number.isFinite(id) && id > 0);
}

function serializeIncoming(call: CallInvite, userId: number) {
  const acceptedCount = Object.values(call.statuses).filter((status) => status === "accepted").length;
  const ringingCount = Object.values(call.statuses).filter((status) => status === "ringing").length;
  const busyCount = Object.values(call.statuses).filter((status) => status === "busy").length;
  const declinedCount = Object.values(call.statuses).filter((status) => status === "declined").length;
  const missedCount = Object.values(call.statuses).filter((status) => status === "missed").length;
  return {
    callId: call.callId,
    channel: call.channel,
    chatId: call.chatId,
    type: call.type,
    callerId: call.callerId,
    callerName: call.callerName ?? "Videh user",
    participantCount: call.participantIds.length + 1,
    acceptedCount,
    acceptedUserIds: acceptedUserIdsFromCall(call),
    ringingCount,
    busyCount,
    declinedCount,
    missedCount,
    status: call.statuses[userId] ?? null,
    createdAt: new Date(call.createdAt).toISOString(),
  };
}

router.post("/calls", async (req: Request, res: Response) => {
  await cleanupSessions();
  const body = req.body as { chatId?: number; type?: "audio" | "video" };
  const chatId = Number(body.chatId);
  const callerId = Number((req as any).authUserId);
  if (!chatId || !callerId) {
    res.status(400).json({ success: false, message: "chatId is required." });
    return;
  }
  if (
    isRateLimited(`webrtc:call:user:${callerId}`, 20, 60_000)
    || isRateLimited(`webrtc:call:ip:${clientIp(req)}`, 40, 60_000)
  ) {
    res.status(429).json({ success: false, message: "Too many call attempts. Try again shortly." });
    return;
  }

  try {
    const chatRow = await query(
      `SELECT is_group FROM chats WHERE id = $1`,
      [chatId],
    );
    if (!chatRow.rows[0]) {
      res.status(404).json({ success: false, message: "Chat not found." });
      return;
    }
    if (chatRow.rows[0].is_group) {
      res.status(400).json({
        success: false,
        message: "Group calls are not supported yet. Start a voice or video call from a personal chat.",
      });
      return;
    }

    const members = await query(
      `SELECT cm.user_id, u.name, u.push_token
      FROM chat_members cm
      JOIN users u ON u.id = cm.user_id
      WHERE cm.chat_id = $1`,
      [chatId],
    );
    const caller = members.rows.find((row: any) => Number(row.user_id) === callerId);
    if (!caller) {
      res.status(403).json({ success: false, message: "Caller is not a chat member." });
      return;
    }
    const participantIds = members.rows
      .map((row: any) => Number(row.user_id))
      .filter((id: number) => id && id !== callerId);
    const allowedParticipants = await query(`
      SELECT cm.user_id
      FROM chat_members cm
      WHERE cm.chat_id = $1
        AND cm.user_id != $2
        AND NOT EXISTS (
          SELECT 1 FROM blocked_users b
          WHERE (b.blocker_id = $2 AND b.blocked_id = cm.user_id)
            OR (b.blocker_id = cm.user_id AND b.blocked_id = $2)
        )
    `, [chatId, callerId]);
    const allowedIds = new Set(allowedParticipants.rows.map((row: any) => Number(row.user_id)));
    let callableParticipantIds = participantIds.filter((id) => allowedIds.has(id));
    if (callableParticipantIds.length === 0) {
      res.status(400).json({ success: false, message: "No participants to call." });
      return;
    }

    // Enforce silence_unknown_callers: unknown = no prior messages in this chat.
    const historyRes = await query(
      `SELECT EXISTS(
         SELECT 1 FROM messages
         WHERE chat_id = $1 AND COALESCE(is_deleted, FALSE) = FALSE
         LIMIT 1
       ) AS has_history`,
      [chatId],
    );
    const hasChatHistory = Boolean(historyRes.rows[0]?.has_history);
    if (!hasChatHistory && callableParticipantIds.length > 0) {
      const { ensureExtendedPrivacyColumns } = await import("../lib/userPrivacySettings");
      await ensureExtendedPrivacyColumns();
      const silenceRes = await query(
        `SELECT id FROM users WHERE id = ANY($1::int[]) AND silence_unknown_callers = TRUE`,
        [callableParticipantIds],
      );
      const silenced = new Set(silenceRes.rows.map((r: { id: number }) => Number(r.id)));
      if (silenced.size > 0) {
        callableParticipantIds = callableParticipantIds.filter((id) => !silenced.has(id));
      }
      if (callableParticipantIds.length === 0) {
        res.status(403).json({
          success: false,
          message: "This person only accepts calls from known contacts.",
        });
        return;
      }
    }

    await releaseStaleCallsForUser(callerId);
    for (const participantId of callableParticipantIds) {
      await releaseStaleCallsForUser(participantId);
    }
    const liveCalls = await listActiveCalls();
    for (const stale of liveCalls) {
      if (stale.chatId !== chatId) continue;
      if (stale.callerId !== callerId && !stale.participantIds.includes(callerId)) continue;
      if (isNegotiateGhost(stale) || callIsOrphanStale(stale)) await finalizeCall(stale);
    }
    const refreshedLive = await listActiveCalls();

    const callId = `call_${chatId}_${Date.now()}`;
    const channel = `videh_${chatId}_${Date.now()}`;
    const statuses: CallInvite["statuses"] = {};
    const busyParticipantIds: number[] = [];
    callableParticipantIds.forEach((id) => {
      if (userIsOnLiveCall(refreshedLive, id)) {
        statuses[id] = "busy";
        busyParticipantIds.push(id);
      } else {
        statuses[id] = "ringing";
      }
    });
    statuses[callerId] = "calling";
    const invite: CallInvite = {
      callId,
      channel,
      chatId,
      type: body.type === "video" ? "video" : "audio",
      callerId,
      callerName: caller.name ?? null,
      participantIds: callableParticipantIds,
      statuses,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveCall(invite);
    scheduleRingExpiry(callId);
    scheduleRingReminders(callId);
    const ringingIds = callableParticipantIds.filter((id) => statuses[id] === "ringing");
    if (ringingIds.length > 0) {
      publishCallSignal({
        chatId,
        userIds: ringingIds,
        action: "ringing",
        payload: {
          ...serializeIncoming(invite, callerId),
          callerId,
          statuses: invite.statuses,
          action: "ringing",
        },
      });
    }
    const pushUserIds = userIdsNeedingCallPush(ringingIds);
    if (busyParticipantIds.length > 0) {
      publishCallSignal({
        chatId,
        userIds: [callerId, ...busyParticipantIds],
        action: "busy",
        payload: { callId, chatId, busyParticipantIds, type: invite.type },
      });
    }
    if (ringingIds.length > 0) {
      void (async () => {
        try {
          const { shouldSendPushForKind } = await import("../lib/notificationPrefs");
          const pushTokens: string[] = [];
          for (const row of members.rows as { user_id: number; push_token: string | null }[]) {
            if (!pushUserIds.includes(Number(row.user_id))) continue;
            if (!(await shouldSendPushForKind(Number(row.user_id), "calls"))) continue;
            if (isValidPushToken(row.push_token)) pushTokens.push(row.push_token!);
          }
          if (pushTokens.length === 0) return;
          await sendChatPush(
            pushTokens,
            body.type === "video" ? "Video call" : "Voice call",
            `${caller.name ?? "Videh user"} is calling`,
            {
              callId,
              chatId: String(chatId),
              type: invite.type,
              channel,
              callerId: String(callerId),
              callerName: caller.name ?? "Videh user",
              kind: "call",
              notificationKind: "incoming_call",
            },
            { categoryId: EXPO_INCOMING_CALL_CATEGORY_ID, threadId: `call-${callId}`, isCall: true },
          );
        } catch (err) {
          console.error("call invite push", err);
        }
      })();
    }
    const allInviteesBusy = callableParticipantIds.length > 0 && ringingIds.length === 0;
    if (allInviteesBusy) {
      await finalizeCall(invite);
    }
    res.json({
      success: true,
      call: serializeIncoming(invite, callerId),
      participantIds: callableParticipantIds,
      busyParticipantIds,
      allInviteesBusy,
    });
  } catch (err) {
    req.log?.error?.({ err }, "create webrtc call invite");
    res.status(500).json({ success: false, message: "Could not start call." });
  }
});

router.get("/calls/incoming/:userId", async (req: Request, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  void cleanupSessions();
  const userId = Number(req.params.userId);
  if (!assertSameUser(req, res, userId)) return;
  const calls = (await Promise.all((await stateKeys("webrtc:call:")).map((key) => stateGetJson<CallInvite>(key))))
    .filter((call): call is CallInvite => Boolean(call));
  const ringing = calls.filter(
    (call) =>
      call.statuses[userId] === "ringing"
      && call.callerId !== userId
      && Date.now() - call.createdAt <= RING_TIMEOUT_MS,
  );
  const incoming = ringing
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((call) => serializeIncoming(call, userId));
  res.json({ success: true, calls: incoming });
});

router.post("/calls/:callId/respond", async (req: Request, res: Response) => {
  await cleanupSessions();
  const call = await getCall(String(req.params.callId));
  const body = req.body as { userId?: number; action?: "accept" | "decline"; declineMessage?: string };
  const userId = Number(body.userId);
  if (!call || !userId || !call.statuses[userId]) {
    res.status(404).json({ success: false, message: "Call expired — ask them to call again." });
    return;
  }
  if (!assertSameUser(req, res, userId)) return;

  if (body.action === "accept") {
    req.log?.info?.({ callId: call.callId, userId }, "webrtc call accept");
    if (call.statuses[userId] !== "ringing") {
      const msg = call.statuses[userId] === "missed"
        ? "Call expired — ask them to call again."
        : "Call is no longer ringing.";
      res.status(409).json({ success: false, message: msg });
      return;
    }
    await releaseStaleCallsForUser(userId, call.callId);
    const liveCalls = await listActiveCalls();
    if (userIsOnLiveCall(liveCalls, userId, call.callId)) {
      call.statuses[userId] = "busy";
      call.updatedAt = Date.now();
      publishCallSignal({
        chatId: call.chatId,
        userIds: [call.callerId, ...call.participantIds],
        action: "busy",
        payload: serializeIncoming(call, userId),
      });
      if (isCallEnded(call)) await finalizeCall(call);
      else await saveCall(call);
      res.json({ success: true, call: serializeIncoming(call, userId), busy: true });
      return;
    }
    call.statuses[userId] = "accepted";
    clearRingExpiryTimer(call.callId);
  } else {
    call.statuses[userId] = "declined";
  }
  if (body.action === "decline") {
    const text = String(body.declineMessage ?? "").trim().slice(0, 500);
    if (text) {
      try {
        const msgRes = await query(
          `INSERT INTO messages (chat_id, sender_id, content, type) VALUES ($1, $2, $3, 'text') RETURNING id`,
          [call.chatId, userId, text],
        );
        const messageId = msgRes.rows[0]?.id;
        if (messageId) {
          const recipientIds = [call.callerId, ...call.participantIds].filter((id) => id !== userId);
          publishChatEvent({
            type: "message",
            chatId: call.chatId,
            userIds: [call.callerId, ...call.participantIds],
            payload: { messageId, preview: text },
          });
        }
      } catch (err) {
        req.log?.error?.({ err }, "decline call message");
      }
    }
  }
  call.updatedAt = Date.now();

  // FIX: Publish accepted signal with acceptedUserIds so the caller's frontend
  // immediately knows who accepted without waiting for the next status poll.
  publishCallSignal({
    chatId: call.chatId,
    userIds: [call.callerId, ...call.participantIds],
    action: body.action === "accept" ? "accepted" : "declined",
    payload: {
      ...serializeIncoming(call, userId),
      callId: call.callId,
      channel: call.channel,
      callerId: call.callerId,
      acceptingUserId: userId,
      statuses: call.statuses,
      // Include acceptedUserIds explicitly for caller to start WebRTC immediately
      acceptedUserIds: acceptedUserIdsFromCall(call),
      acceptedCount: Object.values(call.statuses).filter((s) => s === "accepted").length,
      action: body.action === "accept" ? "accepted" : "declined",
    },
  });
  if (isCallEnded(call)) {
    await finalizeCall(call);
  } else {
    await saveCall(call);
  }
  res.json({
    success: true,
    call: serializeIncoming(call, userId),
    callerId: call.callerId,
    // FIX: Return acceptedUserIds in respond response so frontend can
    // immediately update acceptedUserIds state and unblock WebRTC start.
    acceptedUserIds: acceptedUserIdsFromCall(call),
    acceptedCount: Object.values(call.statuses).filter((s) => s === "accepted").length,
  });
});

/** Mark call connected once WebRTC media path is up (client reports connectionState connected). */
router.post("/calls/:callId/connected", async (req: Request, res: Response) => {
  await cleanupSessions();
  const call = await getCall(String(req.params.callId));
  const userId = Number((req.body as { userId?: number }).userId) || Number((req as any).authUserId);
  if (!call || !userId || !isCallParticipant(call, userId)) {
    res.status(404).json({ success: false, message: "Call not found." });
    return;
  }
  if (!assertSameUser(req, res, userId)) return;
  await markCallConnected(call);
  res.json({ success: true, connectedAt: call.connectedAt });
});

router.get("/calls/:callId/status", async (req: Request, res: Response) => {
  await cleanupSessions();
  const call = await getCall(String(req.params.callId));
  const userId = authUid(req);
  if (!call) {
    res.status(404).json({ success: false, message: "Call not found." });
    return;
  }
  if (!userId || !isCallParticipant(call, userId)) {
    res.status(403).json({ success: false, message: "Not a call participant." });
    return;
  }
  if (!assertSameUser(req, res, userId)) return;

  // Multi-worker safe ring expiry (process-local timers may not exist on this worker).
  if (Date.now() - call.createdAt > RING_TIMEOUT_MS) {
    let ringExpired = false;
    for (const uid of call.participantIds) {
      if (call.statuses[uid] === "ringing") {
        call.statuses[uid] = "missed";
        ringExpired = true;
      }
    }
    if (ringExpired) {
      call.updatedAt = Date.now();
      if (isCallEnded(call)) await finalizeCall(call);
      else await saveCall(call);
    }
  }

  const acceptedCount = Object.values(call.statuses).filter((status) => status === "accepted").length;
  const ringingCount = Object.values(call.statuses).filter((status) => status === "ringing").length;
  const declinedCount = Object.values(call.statuses).filter((status) => status === "declined").length;
  const missedCount = Object.values(call.statuses).filter((status) => status === "missed").length;
  const busyCount = Object.values(call.statuses).filter((status) => status === "busy").length;
  const ended = isCallEnded(call);
  const myStatus = call.statuses[userId];
  // Heartbeat while connected, negotiating, or on hold so orphan cleanup stays accurate.
  if (
    !ended
    && (call.connectedAt
      || callIsOnHold(call)
      || myStatus === "accepted"
      || myStatus === "calling")
  ) {
    call.updatedAt = Date.now();
    await saveCall(call);
  }
  const allInviteesBusy =
    call.participantIds.length > 0
    && call.participantIds.every((id) => call.statuses[id] === "busy");
  const acceptedUserIds = Object.entries(call.statuses)
    .filter(([, status]) => status === "accepted")
    .map(([id]) => Number(id))
    .filter((id) => Number.isFinite(id));
  res.json({
    success: true,
    call: serializeIncoming(call, userId || call.callerId),
    acceptedCount,
    ringingCount,
    declinedCount,
    missedCount,
    busyCount,
    allInviteesBusy,
    ended,
    statuses: call.statuses,
    acceptedUserIds,
    callerId: call.callerId,
    connectedAt: call.connectedAt ?? null,
  });
});

router.post("/calls/:callId/participants", async (req: Request, res: Response) => {
  await cleanupSessions();
  const call = await getCall(String(req.params.callId));
  const requesterId = Number((req as any).authUserId);
  const body = req.body as { userIds?: number[] };
  const rawIds = Array.isArray(body.userIds) ? body.userIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0) : [];

  if (!call) {
    res.status(404).json({ success: false, message: "Call not found." });
    return;
  }
  if (!requesterId || !isCallParticipant(call, requesterId)) {
    res.status(403).json({ success: false, message: "Only active participants can add people to the call." });
    return;
  }
  const requesterStatus = call.statuses[requesterId];
  if (requesterStatus !== "accepted" && requesterStatus !== "calling") {
    res.status(403).json({ success: false, message: "Only active participants can add people to the call." });
    return;
  }

  const uniqueIds = [...new Set(rawIds)].filter((id) => id !== requesterId && id !== call.callerId);
  if (uniqueIds.length === 0) {
    res.status(400).json({ success: false, message: "Select at least one person to add." });
    return;
  }

  try {
    const chatRow = await query(`SELECT is_group FROM chats WHERE id = $1`, [call.chatId]);
    if (!chatRow.rows[0]?.is_group) {
      res.status(400).json({
        success: false,
        message: "Cannot add participants to a one-to-one call.",
      });
      return;
    }

    const memberRes = await query(
      `SELECT user_id FROM chat_members WHERE chat_id = $1 AND user_id = ANY($2::int[])`,
      [call.chatId, uniqueIds],
    );
    const memberIds = new Set(memberRes.rows.map((r: { user_id: number }) => Number(r.user_id)));

    const blockRes = await query(
      `SELECT blocker_id, blocked_id FROM blocked_users
      WHERE (blocker_id = $1 AND blocked_id = ANY($2::int[]))
          OR (blocker_id = ANY($2::int[]) AND blocked_id = $1)`,
      [requesterId, uniqueIds],
    );
    const blocked = new Set<number>();
    for (const row of blockRes.rows as { blocker_id: number; blocked_id: number }[]) {
      const other = Number(row.blocker_id) === requesterId ? Number(row.blocked_id) : Number(row.blocker_id);
      blocked.add(other);
    }
    const allowedIds = uniqueIds.filter((id) => memberIds.has(id) && !blocked.has(id));
    if (allowedIds.length === 0) {
      res.status(403).json({
        success: false,
        message: "Can only add group members who are not blocked.",
      });
      return;
    }

    const liveCalls = await listActiveCalls();
    const addedRinging: number[] = [];
    const busyIds: number[] = [];
    const alreadyOnCall: number[] = [];

    for (const id of allowedIds) {
      const existingStatus = call.statuses[id];
      if (call.participantIds.includes(id)) {
        if (existingStatus === "accepted" || existingStatus === "ringing") {
          alreadyOnCall.push(id);
          continue;
        }
        if (existingStatus === "declined" || existingStatus === "missed" || existingStatus === "busy") {
          if (userIsOnLiveCall(liveCalls, id, call.callId)) {
            call.statuses[id] = "busy";
            busyIds.push(id);
          } else {
            call.statuses[id] = "ringing";
            addedRinging.push(id);
          }
          continue;
        }
      }

      if (userIsOnLiveCall(liveCalls, id, call.callId)) {
        call.participantIds.push(id);
        call.statuses[id] = "busy";
        busyIds.push(id);
      } else {
        call.participantIds.push(id);
        call.statuses[id] = "ringing";
        addedRinging.push(id);
      }
    }

    call.updatedAt = Date.now();
    if (addedRinging.length > 0) scheduleRingExpiry(call.callId);
    await saveCall(call);

    if (addedRinging.length > 0) {
      publishCallSignal({
        chatId: call.chatId,
        userIds: addedRinging,
        action: "ringing",
        payload: {
          ...serializeIncoming(call, call.callerId),
          callerId: call.callerId,
          addedUserIds: addedRinging,
          addedBy: requesterId,
          action: "ringing",
        },
      });
    }

    if (addedRinging.length > 0) {
      const tokenRes = await query(
        `SELECT id, push_token, name FROM users WHERE id = ANY($1::int[])`,
        [addedRinging],
      );
      const requesterRow = await query(`SELECT name FROM users WHERE id = $1`, [requesterId]);
      const adderName = (requesterRow.rows[0] as { name?: string } | undefined)?.name ?? "Someone";
      const pushTokens = tokenRes.rows
        .map((row: any) => row.push_token)
        .filter((t: unknown): t is string => isValidPushToken(t));
      if (pushTokens.length > 0) {
        await sendChatPush(
          pushTokens,
          call.type === "video" ? "Video call" : "Voice call",
          `${adderName} added you to a call`,
          {
            callId: call.callId,
            chatId: String(call.chatId),
            type: call.type,
            channel: call.channel,
            callerId: String(call.callerId),
            callerName: adderName,
            kind: "call",
            notificationKind: "incoming_call",
          },
          { categoryId: EXPO_INCOMING_CALL_CATEGORY_ID, threadId: `call-${call.callId}`, isCall: true },
        );
      }
    }

    if (busyIds.length > 0) {
      const notifyIds = [...new Set([call.callerId, ...call.participantIds, requesterId])];
      publishCallSignal({
        chatId: call.chatId,
        userIds: notifyIds,
        action: "busy",
        payload: { callId: call.callId, busyParticipantIds: busyIds, addedBy: requesterId, callerId: call.callerId },
      });
    }

    res.json({
      success: true,
      call: serializeIncoming(call, requesterId),
      addedRinging,
      busyIds,
      alreadyOnCall,
    });
  } catch (err) {
    req.log?.error?.({ err }, "add call participants");
    res.status(500).json({ success: false, message: "Could not add participants." });
  }
});

/** Put call on hold / resume (Videh call waiting). */
router.post("/calls/:callId/hold", async (req: Request, res: Response) => {
  const call = await getCall(String(req.params.callId));
  const userId = Number((req as any).authUserId);
  const body = req.body as { hold?: boolean };
  const onHold = body.hold !== false;
  if (!call || !userId || !isCallParticipant(call, userId)) {
    res.status(404).json({ success: false, message: "Call not found." });
    return;
  }
  if (!call.holdByUser) call.holdByUser = {};
  call.holdByUser[userId] = onHold;
  call.updatedAt = Date.now();
  publishCallSignal({
    chatId: call.chatId,
    userIds: [call.callerId, ...call.participantIds],
    action: onHold ? "hold" : "resume",
    payload: { callId: call.callId, userId, hold: onHold },
  });
  await saveCall(call);
  res.json({ success: true, hold: onHold });
});

/** Switch ongoing call between voice and video (Videh upgrade). */
router.post("/calls/:callId/media-type", async (req: Request, res: Response) => {
  const call = await getCall(String(req.params.callId));
  const userId = Number((req as any).authUserId);
  const body = req.body as { type?: "audio" | "video" };
  const nextType = body.type === "video" ? "video" : "audio";
  if (!call || !userId || !isCallParticipant(call, userId)) {
    res.status(404).json({ success: false, message: "Call not found." });
    return;
  }
  if (!call.connectedAt) {
    res.status(400).json({ success: false, message: "Call is not connected yet." });
    return;
  }
  call.type = nextType;
  call.updatedAt = Date.now();
  publishCallSignal({
    chatId: call.chatId,
    userIds: [call.callerId, ...call.participantIds],
    action: "media_type",
    payload: { callId: call.callId, type: nextType, byUserId: userId },
  });
  await saveCall(call);
  res.json({ success: true, type: nextType });
});

router.post("/calls/:callId/end", async (req: Request, res: Response) => {
  const callId = String(req.params.callId);
  const call = await getCall(callId);
  const userId = Number((req as any).authUserId);
  if (call && (!userId || !isCallParticipant(call, userId))) {
    res.status(403).json({ success: false, message: "Not a call participant." });
    return;
  }
  if (call) {
    const wasConnected = Boolean(call.connectedAt);
    const allUserIds = [call.callerId, ...call.participantIds];
    publishCallSignal({
      chatId: call.chatId,
      userIds: allUserIds,
      action: "ended",
      payload: {
        callId: call.callId,
        chatId: call.chatId,
        type: call.type,
        callerId: call.callerId,
        channel: call.channel,
        reason: wasConnected ? "hangup" : "cancelled",
      },
    });
    for (const uid of Object.keys(call.statuses)) {
      const id = Number(uid);
      const cur = call.statuses[id];
      if (cur === "accepted" || cur === "calling") call.statuses[id] = "ended";
      else if (cur === "ringing") call.statuses[id] = "missed";
    }
    call.updatedAt = Date.now();
    await finalizeCall(call);
    if (userId) await releaseStaleCallsForUser(userId, callId);
  } else if (userId) {
    await releaseStaleCallsForUser(userId);
  }
  res.json({ success: true });
});

router.post("/sessions", async (req: Request, res: Response) => {
  await cleanupSessions();
  const body = req.body as {
    channel?: string;
    userId?: number;
    type?: "audio" | "video";
    /** Videh call invite caller — fixes offer/answer when callee connects before caller. */
    videhCallerId?: number;
  };
  const channel = safeChannel(body.channel);
  const userId = Number(body.userId) || authUid(req);
  if (!channel || !userId) {
    res.status(400).json({ success: false, message: "channel and userId are required." });
    return;
  }
  if (!assertSameUser(req, res, userId)) return;

  const linkedCall = await findCallByChannel(channel);
  if (!linkedCall || !isCallParticipant(linkedCall, userId)) {
    res.status(403).json({ success: false, message: "Not a call participant." });
    return;
  }

  const videhCallerId = linkedCall.callerId;
  let session = await getSession(channel);
  let role: Role = "caller";
  const iAmVidehCaller = videhCallerId === userId;
  if (!session) {
    session = {
      channel,
      type: body.type === "video" ? "video" : linkedCall.type,
      callerId: videhCallerId,
      calleeId: iAmVidehCaller ? undefined : userId,
      callerCandidates: [],
      calleeCandidates: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    role = iAmVidehCaller ? "caller" : "callee";
  } else {
    if (session.callerId !== videhCallerId) {
      session.callerId = videhCallerId;
    }
    role = session.callerId === userId ? "caller" : "callee";
    if (role === "callee") session.calleeId = userId;
    session.updatedAt = Date.now();
  }
  await saveSession(session);

  res.json({
    success: true,
    role,
    session: {
      channel: session.channel,
      type: session.type,
      hasOffer: Boolean(session.offer),
      hasAnswer: Boolean(session.answer),
      offer: role === "callee" ? (session.offer ?? null) : null,
      answer: role === "caller" ? (session.answer ?? null) : null,
      offerRevision: session.offerRevision ?? 0,
      answerRevision: session.answerRevision ?? 0,
    },
  });
});

router.get("/sessions/:channel", async (req: Request, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  await cleanupSessions();
  const channel = safeChannel(req.params.channel);
  const access = await requireSessionAccess(req, res, channel);
  if (!access) return;
  const { session, role } = access;
  session.updatedAt = Date.now();
  await saveSession(session);
  res.json({
    success: true,
    session: {
      channel: session.channel,
      type: session.type,
      offer: role === "callee" ? (session.offer ?? null) : null,
      answer: role === "caller" ? (session.answer ?? null) : null,
      offerRevision: session.offerRevision ?? 0,
      answerRevision: session.answerRevision ?? 0,
      callerId: session.callerId,
      calleeId: session.calleeId ?? null,
    },
  });
});

router.post("/sessions/:channel/offer", async (req: Request, res: Response) => {
  const channel = safeChannel(req.params.channel);
  const access = await requireSessionAccess(req, res, channel);
  if (!access) return;
  if (access.role !== "caller") {
    res.status(403).json({ success: false, message: "Only the caller can post the offer." });
    return;
  }
  const { session } = access;
  const body = req.body as { offer?: unknown; iceRestart?: boolean };
  if (body.iceRestart) {
    session.answer = undefined;
    session.answerRevision = 0;
    session.callerCandidates = [];
    session.calleeCandidates = [];
  }
  session.offer = body.offer ?? null;
  session.offerRevision = (session.offerRevision ?? 0) + 1;
  session.updatedAt = Date.now();
  await saveSession(session);
  req.log?.info?.({ channel, offerRevision: session.offerRevision, iceRestart: Boolean(body.iceRestart) }, "webrtc offer posted");
  res.json({ success: true, offerRevision: session.offerRevision });
});

router.post("/sessions/:channel/answer", async (req: Request, res: Response) => {
  const channel = safeChannel(req.params.channel);
  const access = await requireSessionAccess(req, res, channel);
  if (!access) return;
  if (access.role !== "callee") {
    res.status(403).json({ success: false, message: "Only the callee can post the answer." });
    return;
  }
  const { session } = access;
  session.answer = (req.body as { answer?: unknown }).answer ?? null;
  session.answerRevision = (session.answerRevision ?? 0) + 1;
  session.updatedAt = Date.now();
  await saveSession(session);
  req.log?.info?.({ channel, answerRevision: session.answerRevision }, "webrtc answer posted");
  // Connected time is marked only via POST /calls/:callId/connected (media up).
  res.json({ success: true, answerRevision: session.answerRevision });
});

router.post("/sessions/:channel/candidates", async (req: Request, res: Response) => {
  const channel = safeChannel(req.params.channel);
  const access = await requireSessionAccess(req, res, channel);
  if (!access) return;
  const role = (req.body as { role?: Role }).role;
  const candidate = (req.body as { candidate?: unknown }).candidate;
  if ((role !== "caller" && role !== "callee") || !candidate) {
    res.status(400).json({ success: false });
    return;
  }
  if (role !== access.role) {
    res.status(403).json({ success: false, message: "Role mismatch." });
    return;
  }
  const { session } = access;
  if (role === "caller") session.callerCandidates.push(candidate);
  else session.calleeCandidates.push(candidate);
  session.updatedAt = Date.now();
  await saveSession(session);
  res.json({ success: true });
});

router.get("/sessions/:channel/candidates", async (req: Request, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  const channel = safeChannel(req.params.channel);
  const access = await requireSessionAccess(req, res, channel);
  if (!access) return;
  const role = String(req.query.role ?? "") as Role;
  const since = Math.max(0, Number(req.query.since) || 0);
  if (role !== "caller" && role !== "callee") {
    res.status(400).json({ success: false });
    return;
  }
  if (role !== access.role) {
    res.status(403).json({ success: false, message: "Role mismatch." });
    return;
  }
  const { session } = access;
  const remoteCandidates = role === "caller" ? session.calleeCandidates : session.callerCandidates;
  session.updatedAt = Date.now();
  await saveSession(session);
  res.json({ success: true, candidates: remoteCandidates.slice(since), next: remoteCandidates.length });
});

router.delete("/sessions/:channel", async (req: Request, res: Response) => {
  const channel = safeChannel(req.params.channel);
  const access = await requireSessionAccess(req, res, channel);
  if (!access) return;
  await stateDelete(sessionKey(channel));
  res.json({ success: true });
});

/** Attach a signed-in user to an in-progress call for the chat (call-link join). */
export async function attachJoinerToLiveCall(
  chatId: number,
  joinerId: number,
): Promise<{
  callId: string;
  channel: string;
  callerId: number;
  type: "audio" | "video";
  alreadyOnCall: boolean;
} | null> {
  const call = await findLiveCallByChatId(chatId);
  if (!call) return null;
  if (call.callerId === joinerId) {
    return {
      callId: call.callId,
      channel: call.channel,
      callerId: call.callerId,
      type: call.type,
      alreadyOnCall: true,
    };
  }
  if (!call.participantIds.includes(joinerId)) {
    call.participantIds.push(joinerId);
  }
  const prev = call.statuses[joinerId];
  if (prev === "accepted" || prev === "calling") {
    return {
      callId: call.callId,
      channel: call.channel,
      callerId: call.callerId,
      type: call.type,
      alreadyOnCall: true,
    };
  }
  call.statuses[joinerId] = "accepted";
  call.updatedAt = Date.now();
  clearRingExpiryTimer(call.callId);
  await saveCall(call);
  publishCallSignal({
    chatId: call.chatId,
    userIds: [call.callerId, ...call.participantIds],
    action: "accepted",
    payload: {
      ...serializeIncoming(call, joinerId),
      callId: call.callId,
      channel: call.channel,
      callerId: call.callerId,
      acceptingUserId: joinerId,
      acceptedUserIds: acceptedUserIdsFromCall(call),
      action: "accepted",
    },
  });
  return {
    callId: call.callId,
    channel: call.channel,
    callerId: call.callerId,
    type: call.type,
    alreadyOnCall: false,
  };
}

export default router;
import { Router, type Request, type Response } from "express";
import { assertSameUser, requireAuth } from "../lib/auth";
import { insertCallChatMessage, publishCallSignal } from "../lib/callMessages";
import { query } from "../lib/db";
import { publishChatEvent } from "../lib/realtime";
import { EXPO_INCOMING_CALL_CATEGORY_ID } from "../lib/expoPush";
import { isValidPushToken, sendChatPush } from "../lib/pushNotify";
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
  statuses: Record<number, "ringing" | "accepted" | "declined" | "missed" | "ended" | "busy">;
  createdAt: number;
  updatedAt: number;
  connectedAt?: number;
  logged?: boolean;
};

const router = Router();
router.use(requireAuth);
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const RING_TIMEOUT_MS = 60 * 1000;
const sessionKey = (channel: string) => `webrtc:session:${channel}`;
const callKey = (callId: string) => `webrtc:call:${callId}`;

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
}

async function cleanupSessions() {
  const now = Date.now();
  for (const key of await stateKeys("webrtc:session:")) {
    const session = await stateGetJson<SignalSession>(key);
    if (session && now - session.updatedAt > SESSION_TTL_MS) await stateDelete(key);
  }
  for (const key of await stateKeys("webrtc:call:")) {
    const call = await stateGetJson<CallInvite>(key);
    if (!call) continue;
    if (now - call.updatedAt > SESSION_TTL_MS) {
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
        if (isCallEnded(call)) await persistCallHistory(call);
        await saveCall(call);
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
  return calls.filter((c): c is CallInvite => Boolean(c) && !isCallEnded(c));
}

/** User is already on a connected call (busy). */
function userIsOnLiveCall(calls: CallInvite[], userId: number, exceptCallId?: string): boolean {
  return calls.some((call) => {
    if (exceptCallId && call.callId === exceptCallId) return false;
    if (isCallEnded(call)) return false;
    return call.statuses[userId] === "accepted";
  });
}

function isCallParticipant(call: CallInvite, userId: number): boolean {
  return call.callerId === userId || call.participantIds.includes(userId);
}

async function persistCallHistory(call: CallInvite): Promise<void> {
  if (call.logged || call.participantIds.length === 0) return;
  const calleeId = call.participantIds[0];
  const calleeStatus = call.statuses[calleeId];
  let status = "missed";
  if (calleeStatus === "busy") status = "busy";
  else if (calleeStatus === "declined") status = "declined";
  else if (call.connectedAt) status = "answered";
  const durationSeconds = call.connectedAt
    ? Math.max(0, Math.round((Date.now() - call.connectedAt) / 1000))
    : 0;
  const result =
    status === "answered" ? "answered"
    : status === "declined" ? "declined"
    : status === "busy" ? "busy"
    : "missed";
  try {
    await query(
      `INSERT INTO calls (caller_id, callee_id, chat_id, type, status, duration_seconds, started_at, ended_at)
       VALUES ($1, $2, $3, $4, $5, $6, to_timestamp($7 / 1000.0), NOW())`,
      [call.callerId, calleeId, call.chatId, call.type, status, durationSeconds, call.connectedAt ?? call.createdAt],
    );
    call.logged = true;
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
      action: result === "answered" ? "ended" : result === "declined" ? "declined" : result === "busy" ? "busy" : "missed",
      payload: { callId: call.callId, chatId: call.chatId, type: call.type, result, durationSeconds },
    });
  } catch (err) {
    console.error("persistCallHistory error", err);
  }
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
    ringingCount,
    busyCount,
    declinedCount,
    missedCount,
    status: call.statuses[userId] ?? null,
    createdAt: new Date(call.createdAt).toISOString(),
  };
}

router.get("/ice-config", (_req: Request, res: Response) => {
  res.json({ success: true, iceServers: getIceServers() });
});

router.post("/calls", async (req: Request, res: Response) => {
  await cleanupSessions();
  const body = req.body as { chatId?: number; type?: "audio" | "video" };
  const chatId = Number(body.chatId);
  const callerId = Number((req as any).authUserId);
  if (!chatId || !callerId) {
    res.status(400).json({ success: false, message: "chatId is required." });
    return;
  }

  try {
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
    const callableParticipantIds = participantIds.filter((id) => allowedIds.has(id));
    if (callableParticipantIds.length === 0) {
      res.status(400).json({ success: false, message: "No participants to call." });
      return;
    }

    const callId = `call_${chatId}_${Date.now()}`;
    const channel = `videh_${chatId}_${Date.now()}`;
    const liveCalls = await listActiveCalls();
    const statuses: CallInvite["statuses"] = {};
    const busyParticipantIds: number[] = [];
    callableParticipantIds.forEach((id) => {
      if (userIsOnLiveCall(liveCalls, id)) {
        statuses[id] = "busy";
        busyParticipantIds.push(id);
      } else {
        statuses[id] = "ringing";
      }
    });
    statuses[callerId] = "accepted";
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
    publishCallSignal({
      chatId,
      userIds: [callerId, ...callableParticipantIds],
      action: "ringing",
      payload: serializeIncoming(invite, callerId),
    });
    const ringingIds = callableParticipantIds.filter((id) => statuses[id] === "ringing");
    const pushTokens = members.rows
      .filter((row: any) => ringingIds.includes(Number(row.user_id)))
      .map((row: any) => row.push_token)
      .filter((t: unknown): t is string => isValidPushToken(t));
    if (busyParticipantIds.length > 0) {
      publishCallSignal({
        chatId,
        userIds: [callerId, ...busyParticipantIds],
        action: "busy",
        payload: { callId, chatId, busyParticipantIds, type: invite.type },
      });
    }
    if (ringingIds.length > 0 && pushTokens.length > 0) {
      await sendChatPush(
        pushTokens,
        body.type === "video" ? "Video call" : "Voice call",
        `${caller.name ?? "Videh user"} is calling`,
        {
          callId,
          chatId: String(chatId),
          type: invite.type,
          channel,
          callerName: caller.name ?? "Videh user",
          kind: "call",
          notificationKind: "incoming_call",
        },
        { categoryId: EXPO_INCOMING_CALL_CATEGORY_ID, threadId: `call-${callId}`, isCall: true },
      );
    }
    const allInviteesBusy = callableParticipantIds.length > 0 && ringingIds.length === 0;
    if (allInviteesBusy) {
      await persistCallHistory(invite);
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
  await cleanupSessions();
  const userId = Number(req.params.userId);
  if (!assertSameUser(req, res, userId)) return;
  const calls = (await Promise.all((await stateKeys("webrtc:call:")).map((key) => stateGetJson<CallInvite>(key))))
    .filter((call): call is CallInvite => Boolean(call));
  const incoming = calls
    .filter((call) => call.statuses[userId] === "ringing")
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
    res.status(404).json({ success: false, message: "Call not found." });
    return;
  }
  if (!assertSameUser(req, res, userId)) return;

  if (body.action === "accept") {
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
      if (isCallEnded(call)) await persistCallHistory(call);
      await saveCall(call);
      res.json({ success: true, call: serializeIncoming(call, userId), busy: true });
      return;
    }
    call.statuses[userId] = "accepted";
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
          if (recipientIds.length > 0) {
            await query(
              `INSERT INTO message_status (message_id, user_id, status)
               SELECT $1, unnest($2::int[]), 'delivered'
               ON CONFLICT (message_id, user_id) DO UPDATE SET status = 'delivered', updated_at = NOW()`,
              [messageId, recipientIds],
            );
          }
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
  if (body.action === "accept" && !call.connectedAt) {
    call.connectedAt = Date.now();
  }
  call.updatedAt = Date.now();
  publishCallSignal({
    chatId: call.chatId,
    userIds: [call.callerId, ...call.participantIds],
    action: body.action === "accept" ? "accepted" : "declined",
    payload: serializeIncoming(call, userId),
  });
  if (isCallEnded(call)) await persistCallHistory(call);
  await saveCall(call);
  res.json({ success: true, call: serializeIncoming(call, userId) });
});

router.get("/calls/:callId/status", async (req: Request, res: Response) => {
  await cleanupSessions();
  const call = await getCall(String(req.params.callId));
  const userId = Number(req.query.userId) || Number((req as any).authUserId);
  if (!call) {
    res.status(404).json({ success: false, message: "Call not found." });
    return;
  }
  if (!userId || !isCallParticipant(call, userId)) {
    res.status(403).json({ success: false, message: "Not a call participant." });
    return;
  }
  const acceptedCount = Object.values(call.statuses).filter((status) => status === "accepted").length;
  const ringingCount = Object.values(call.statuses).filter((status) => status === "ringing").length;
  const declinedCount = Object.values(call.statuses).filter((status) => status === "declined").length;
  const missedCount = Object.values(call.statuses).filter((status) => status === "missed").length;
  const busyCount = Object.values(call.statuses).filter((status) => status === "busy").length;
  const ended = isCallEnded(call);
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
  });
});

router.post("/calls/:callId/end", async (req: Request, res: Response) => {
  const call = await getCall(String(req.params.callId));
  const userId = Number((req as any).authUserId);
  if (call && (!userId || !isCallParticipant(call, userId))) {
    res.status(403).json({ success: false, message: "Not a call participant." });
    return;
  }
  if (call) {
    Object.keys(call.statuses).forEach((uid) => { call.statuses[Number(uid)] = "ended"; });
    call.updatedAt = Date.now();
    await persistCallHistory(call);
    await saveCall(call);
    await stateDelete(sessionKey(call.channel));
  }
  res.json({ success: true });
});

router.post("/sessions", async (req: Request, res: Response) => {
  await cleanupSessions();
  const body = req.body as { channel?: string; userId?: number; type?: "audio" | "video" };
  const channel = safeChannel(body.channel);
  const userId = Number(body.userId);
  if (!channel || !userId) {
    res.status(400).json({ success: false, message: "channel and userId are required." });
    return;
  }
  if (!assertSameUser(req, res, userId)) return;

  let session = await getSession(channel);
  let role: Role = "caller";
  if (!session) {
    session = {
      channel,
      type: body.type === "video" ? "video" : "audio",
      callerId: userId,
      callerCandidates: [],
      calleeCandidates: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  } else {
    role = session.callerId === userId ? "caller" : "callee";
    if (role === "callee") session.calleeId = userId;
    session.updatedAt = Date.now();
  }
  await saveSession(session);

  res.json({ success: true, role, session: { channel: session.channel, type: session.type, hasOffer: Boolean(session.offer), hasAnswer: Boolean(session.answer) } });
});

router.get("/sessions/:channel", async (req: Request, res: Response) => {
  await cleanupSessions();
  const channel = safeChannel(req.params.channel);
  const session = await getSession(channel);
  if (!session) {
    res.status(404).json({ success: false, message: "Call session not found." });
    return;
  }
  session.updatedAt = Date.now();
  await saveSession(session);
  res.json({
    success: true,
    session: {
      channel: session.channel,
      type: session.type,
      offer: session.offer ?? null,
      answer: session.answer ?? null,
      callerId: session.callerId,
      calleeId: session.calleeId ?? null,
    },
  });
});

router.post("/sessions/:channel/offer", async (req: Request, res: Response) => {
  const channel = safeChannel(req.params.channel);
  const session = await getSession(channel);
  if (!session) {
    res.status(404).json({ success: false });
    return;
  }
  session.offer = (req.body as { offer?: unknown }).offer ?? null;
  session.updatedAt = Date.now();
  await saveSession(session);
  res.json({ success: true });
});

router.post("/sessions/:channel/answer", async (req: Request, res: Response) => {
  const channel = safeChannel(req.params.channel);
  const session = await getSession(channel);
  if (!session) {
    res.status(404).json({ success: false });
    return;
  }
  session.answer = (req.body as { answer?: unknown }).answer ?? null;
  session.updatedAt = Date.now();
  await saveSession(session);
  res.json({ success: true });
});

router.post("/sessions/:channel/candidates", async (req: Request, res: Response) => {
  const channel = safeChannel(req.params.channel);
  const session = await getSession(channel);
  const role = (req.body as { role?: Role }).role;
  const candidate = (req.body as { candidate?: unknown }).candidate;
  if (!session || (role !== "caller" && role !== "callee") || !candidate) {
    res.status(400).json({ success: false });
    return;
  }
  if (role === "caller") session.callerCandidates.push(candidate);
  else session.calleeCandidates.push(candidate);
  session.updatedAt = Date.now();
  await saveSession(session);
  res.json({ success: true });
});

router.get("/sessions/:channel/candidates", async (req: Request, res: Response) => {
  const channel = safeChannel(req.params.channel);
  const session = await getSession(channel);
  const role = String(req.query.role ?? "") as Role;
  const since = Math.max(0, Number(req.query.since) || 0);
  if (!session || (role !== "caller" && role !== "callee")) {
    res.status(400).json({ success: false });
    return;
  }
  const remoteCandidates = role === "caller" ? session.calleeCandidates : session.callerCandidates;
  session.updatedAt = Date.now();
  await saveSession(session);
  res.json({ success: true, candidates: remoteCandidates.slice(since), next: remoteCandidates.length });
});

router.delete("/sessions/:channel", async (req: Request, res: Response) => {
  await stateDelete(sessionKey(safeChannel(req.params.channel)));
  res.json({ success: true });
});

export default router;

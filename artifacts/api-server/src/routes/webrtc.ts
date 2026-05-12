import { Router, type Request, type Response } from "express";
import { query } from "../lib/db";
import { EXPO_INCOMING_CALL_CATEGORY_ID, isExpoPushToken, sendExpoChatPush } from "../lib/expoPush";
import { stateDelete, stateGetJson, stateKeys, stateSetJson } from "../lib/sharedState";

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
  statuses: Record<number, "ringing" | "accepted" | "declined" | "missed" | "ended">;
  createdAt: number;
  updatedAt: number;
};

const router = Router();
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
      if (changed) await saveCall(call);
    }
  }
}

function safeChannel(raw: unknown): string {
  return String(raw ?? "").trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
}

function serializeIncoming(call: CallInvite, userId: number) {
  const acceptedCount = Object.values(call.statuses).filter((status) => status === "accepted").length;
  const ringingCount = Object.values(call.statuses).filter((status) => status === "ringing").length;
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
    status: call.statuses[userId] ?? null,
    createdAt: new Date(call.createdAt).toISOString(),
  };
}

router.post("/calls", async (req: Request, res: Response) => {
  await cleanupSessions();
  const body = req.body as { chatId?: number; callerId?: number; type?: "audio" | "video" };
  const chatId = Number(body.chatId);
  const callerId = Number(body.callerId);
  if (!chatId || !callerId) {
    res.status(400).json({ success: false, message: "chatId and callerId are required." });
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
    const statuses: CallInvite["statuses"] = {};
    callableParticipantIds.forEach((id) => { statuses[id] = "ringing"; });
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
    const pushTokens = members.rows
      .filter((row: any) => callableParticipantIds.includes(Number(row.user_id)))
      .map((row: any) => row.push_token)
      .filter(isExpoPushToken);
    if (pushTokens.length > 0) {
      sendExpoChatPush(
        pushTokens,
        body.type === "video" ? "Video call" : "Voice call",
        `${caller.name ?? "Videh user"} is calling`,
        { callId, chatId, type: invite.type, channel, callerName: caller.name ?? "Videh user", kind: "call", notificationKind: "incoming_call" },
        { categoryId: EXPO_INCOMING_CALL_CATEGORY_ID, threadId: `call-${callId}` },
      );
    }
    res.json({ success: true, call: serializeIncoming(invite, callerId), participantIds: callableParticipantIds });
  } catch (err) {
    req.log?.error?.({ err }, "create webrtc call invite");
    res.status(500).json({ success: false, message: "Could not start call." });
  }
});

router.get("/calls/incoming/:userId", async (req: Request, res: Response) => {
  await cleanupSessions();
  const userId = Number(req.params.userId);
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
  const body = req.body as { userId?: number; action?: "accept" | "decline" };
  const userId = Number(body.userId);
  if (!call || !userId || !call.statuses[userId]) {
    res.status(404).json({ success: false, message: "Call not found." });
    return;
  }
  call.statuses[userId] = body.action === "accept" ? "accepted" : "declined";
  call.updatedAt = Date.now();
  await saveCall(call);
  res.json({ success: true, call: serializeIncoming(call, userId) });
});

router.get("/calls/:callId/status", async (req: Request, res: Response) => {
  await cleanupSessions();
  const call = await getCall(String(req.params.callId));
  const userId = Number(req.query.userId);
  if (!call) {
    res.status(404).json({ success: false, message: "Call not found." });
    return;
  }
  const acceptedCount = Object.values(call.statuses).filter((status) => status === "accepted").length;
  const ringingCount = Object.values(call.statuses).filter((status) => status === "ringing").length;
  const declinedCount = Object.values(call.statuses).filter((status) => status === "declined").length;
  const missedCount = Object.values(call.statuses).filter((status) => status === "missed").length;
  const ended = Object.values(call.statuses).every((status) => status === "ended" || status === "declined" || status === "missed");
  res.json({
    success: true,
    call: serializeIncoming(call, userId || call.callerId),
    acceptedCount,
    ringingCount,
    declinedCount,
    missedCount,
    ended,
    statuses: call.statuses,
  });
});

router.post("/calls/:callId/end", async (req: Request, res: Response) => {
  const call = await getCall(String(req.params.callId));
  if (call) {
    Object.keys(call.statuses).forEach((uid) => { call.statuses[Number(uid)] = "ended"; });
    call.updatedAt = Date.now();
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

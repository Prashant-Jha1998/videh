import { query } from "./db";
import { publishChatEvent } from "./realtime";

export type CallMessageMeta = {
  callType: "audio" | "video";
  result: "answered" | "missed" | "declined" | "busy" | "unavailable";
  durationSeconds?: number;
};

export function callMessagePreview(meta: CallMessageMeta, participantCount = 1): string {
  const label =
    participantCount > 1
      ? meta.callType === "video"
        ? "Group video call"
        : "Group voice call"
      : meta.callType === "video"
        ? "Video call"
        : "Voice call";
  if (meta.result === "answered") {
    const total = Math.max(0, meta.durationSeconds ?? 0);
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${label} · ${mins}:${String(secs).padStart(2, "0")}`;
  }
  if (meta.result === "declined") {
    return meta.callType === "video" ? "Declined video call" : "Declined voice call";
  }
  if (meta.result === "busy") {
    return meta.callType === "video" ? "Busy on another video call" : "Line busy";
  }
  if (meta.result === "unavailable") {
    return meta.callType === "video" ? "Video call unavailable" : "Couldn't place call";
  }
  return meta.callType === "video" ? "Missed video call" : "Missed voice call";
}

export async function insertCallChatMessage(args: {
  chatId: number;
  callerId: number;
  callType: "audio" | "video";
  result: CallMessageMeta["result"];
  durationSeconds?: number;
  participantIds: number[];
}): Promise<void> {
  const meta: CallMessageMeta = {
    callType: args.callType,
    result: args.result,
    durationSeconds: args.durationSeconds,
  };
  const content = JSON.stringify(meta);
  try {
    const result = await query(
      `INSERT INTO messages (chat_id, sender_id, content, type)
       VALUES ($1, $2, $3, 'call')
       RETURNING id`,
      [args.chatId, args.callerId, content],
    );
    const messageId = result.rows[0]?.id;
    const recipientIds = args.participantIds.filter((id) => id !== args.callerId);
    if (messageId && recipientIds.length > 0) {
      await query(
        `INSERT INTO message_status (message_id, user_id, status)
         SELECT $1, unnest($2::int[]), 'delivered'
         ON CONFLICT (message_id, user_id)
         DO UPDATE SET status = 'delivered', updated_at = NOW()`,
        [messageId, recipientIds],
      );
    }
    publishChatEvent({
      type: "message",
      chatId: args.chatId,
      userIds: [args.callerId, ...args.participantIds],
      payload: { messageId, preview: callMessagePreview(meta, args.participantIds.length) },
    });
  } catch (err) {
    console.error("insertCallChatMessage error", err);
  }
}

export function publishCallSignal(args: {
  chatId: number;
  userIds: number[];
  action:
    | "ringing"
    | "accepted"
    | "declined"
    | "ended"
    | "missed"
    | "busy"
    | "cancelled"
    | "hold"
    | "resume"
    | "media_type"
    | "call_logged";
  payload: unknown;
}): void {
  publishChatEvent({
    type: "call",
    chatId: args.chatId,
    userIds: args.userIds,
    payload: { action: args.action, ...(typeof args.payload === "object" && args.payload ? args.payload as object : { data: args.payload }) },
  });
}

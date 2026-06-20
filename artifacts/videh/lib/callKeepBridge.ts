import { callIdToCallKeepUuid } from "@/lib/callKeepUuid";

export type CallKeepHandlerPayload = {
  callUUID: string;
  callId?: string;
  chatId?: string;
};

type Handlers = {
  onAnswer?: (p: CallKeepHandlerPayload) => void;
  onEnd?: (p: CallKeepHandlerPayload) => void;
};

const callIdByUuid = new Map<string, string>();
const metaByUuid = new Map<string, { callId: string; chatId?: string }>();

let handlers: Handlers = {};

export function setCallKeepHandlers(next: Handlers): void {
  handlers = next;
}

export function resolveCallKeepUuid(callId: string): string {
  return callIdToCallKeepUuid(callId);
}

export function resolveCallIdFromUuid(callUUID: string): string | undefined {
  return callIdByUuid.get(callUUID) ?? metaByUuid.get(callUUID)?.callId;
}

export function registerCallKeepMeta(callId: string, meta: { chatId?: number }): string {
  const uuid = callIdToCallKeepUuid(callId);
  callIdByUuid.set(uuid, callId);
  metaByUuid.set(uuid, { callId, chatId: meta.chatId != null ? String(meta.chatId) : undefined });
  return uuid;
}

export function unregisterCallKeep(callId: string): void {
  const uuid = callIdToCallKeepUuid(callId);
  callIdByUuid.delete(uuid);
  metaByUuid.delete(uuid);
}

export function dispatchCallKeepAnswer(callUUID: string): void {
  const meta = metaByUuid.get(callUUID);
  handlers.onAnswer?.({
    callUUID,
    callId: meta?.callId ?? callIdByUuid.get(callUUID),
    chatId: meta?.chatId,
  });
}

export function dispatchCallKeepEnd(callUUID: string): void {
  const meta = metaByUuid.get(callUUID);
  handlers.onEnd?.({
    callUUID,
    callId: meta?.callId ?? callIdByUuid.get(callUUID),
    chatId: meta?.chatId,
  });
}

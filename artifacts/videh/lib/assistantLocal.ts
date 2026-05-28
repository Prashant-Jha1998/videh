import type { Chat } from "@/context/AppContext";
import type { AssistantCommandResult } from "@/lib/assistantApi";
import { stripWakeFromCommand } from "@/lib/assistantPrefs";

function normalize(text: string): string {
  return text.toLowerCase().replace(/[।.,!?]/g, " ").replace(/\s+/g, " ").trim();
}

function findChat(chats: Chat[], rawName: string): Chat | null {
  const name = rawName.trim().toLowerCase();
  if (!name) return null;
  const exact = chats.find((c) => c.name.toLowerCase() === name);
  if (exact) return exact;
  const partial = chats.find((c) => c.name.toLowerCase().includes(name) || name.includes(c.name.toLowerCase()));
  return partial ?? null;
}

/** Instant on-device routing for common call/open commands (no network). */
export function tryLocalAssistantCommand(text: string, chats: Chat[]): AssistantCommandResult | null {
  const raw = stripWakeFromCommand(text.trim());
  const n = normalize(raw);
  if (!n) return null;

  const callVideo = raw.match(/^(.+?)\s+ko\s+video\s+call/i)
    ?? raw.match(/^video\s+call\s+(.+?)$/i);
  if (callVideo?.[1]) {
    const chat = findChat(chats, callVideo[1]);
    if (chat) {
      return {
        speak: `${chat.name} ko video call lag rahi hai.`,
        intent: "call_contact",
        langCode: "hi",
        actions: [{ type: "start_call", chatId: chat.id, callType: "video", contactName: chat.name }],
      };
    }
  }

  const callAudio = raw.match(/^(.+?)\s+ko\s+(?:voice\s+)?call/i)
    ?? raw.match(/^call\s+(.+?)$/i)
    ?? raw.match(/^(.+?)\s+ko\s+phone/i);
  if (callAudio?.[1]) {
    const chat = findChat(chats, callAudio[1]);
    if (chat) {
      return {
        speak: `${chat.name} ko call lag rahi hai.`,
        intent: "call_contact",
        langCode: "hi",
        actions: [{ type: "start_call", chatId: chat.id, callType: "audio", contactName: chat.name }],
      };
    }
  }

  const openChat = raw.match(/^(?:open|kholo)\s+(.+?)(?:\s+chat)?$/i)
    ?? raw.match(/^(.+?)\s+(?:ka|ke)\s+chat\s+kholo/i);
  if (openChat?.[1]) {
    const chat = findChat(chats, openChat[1]);
    if (chat) {
      return {
        speak: `${chat.name} ki chat khol di.`,
        intent: "open_chat",
        langCode: "hi",
        actions: [{ type: "open_chat", chatId: chat.id, contactName: chat.name }],
      };
    }
  }

  return null;
}

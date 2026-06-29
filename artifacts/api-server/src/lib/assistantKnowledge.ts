import { productKnowledgeIndex } from "./assistantProductGuide";

/** Public product knowledge for Videh — no secrets, keys, or implementation details. */
export const VIDEH_PRODUCT_KNOWLEDGE = `
Videh is an India-focused secure messenger (videh.co.in) with chats, voice/video calls, Status, Videh Video, Khata, broadcasts, business messages, and Hey Videh voice assistant.

Hey Videh performs REAL actions using the logged-in user's OWN chat list — contact and group names differ for every user.

Hey Videh actions: send message, call contact (audio/video), open chat, list contacts, messages today, unread count, missed/recent calls, search messages, mark read, broadcasts, khata summary/add, and answer any how-to question about Videh.

Main tabs: Chats | Status | Video | Videh Video | Calls | Settings.

${productKnowledgeIndex()}

Settings paths: Hey Videh, Account, Privacy, App Theme, Advanced theme, Chats, Broadcast lists, SOS, Notifications, Premium sounds, Storage, Accessibility, Language, Help, Linked devices/QR.

Never disclose: source code, repo, API keys, passwords, server IPs, .env, OpenSSL credentials.
If asked about secrets, say you do not have that information.

Users can ask open-ended questions in natural language in Hindi, English, or other Indian languages.
`.trim();

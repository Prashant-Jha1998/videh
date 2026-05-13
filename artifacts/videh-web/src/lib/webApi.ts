export type SessionStatus = "loading" | "pending" | "scanning" | "linked" | "expired" | "error";

export type WebUser = {
  id: number;
  name: string;
  phone: string;
  about?: string;
  avatarUrl?: string;
};

export type ChatMember = {
  id: number;
  name: string;
  phone?: string;
  about?: string;
  avatar_url?: string;
  is_online?: boolean;
  last_seen?: string;
  is_admin?: boolean;
  joined_at?: string;
};

export type ChatEntry = {
  id: number;
  is_group: boolean;
  group_name?: string;
  group_avatar_url?: string;
  last_message?: {
    id: number;
    content: string;
    type: string;
    media_url?: string;
    created_at: string;
    is_deleted: boolean;
    sender_id: number;
  };
  unread_count: number;
  is_pinned?: boolean;
  is_muted?: boolean;
  other_members?: ChatMember[];
};

export type Reaction = {
  emoji: string;
  user_id: number;
};

export type Message = {
  id: number;
  chat_id: number;
  sender_id: number;
  content: string;
  type: string;
  media_url?: string;
  reply_to_id?: number;
  reply_content?: string;
  reply_sender_name?: string;
  is_deleted: boolean;
  is_starred?: boolean;
  is_forwarded?: boolean;
  forward_count?: number;
  is_view_once?: boolean;
  edited_at?: string;
  created_at: string;
  sender_name?: string;
  sender_avatar?: string;
  reactions?: Reaction[] | null;
  delivery_status?: "sent" | "delivered" | "read" | null;
};

export type ChatDetails = {
  chat?: {
    id: number;
    is_group: boolean;
    group_name?: string;
    group_avatar_url?: string;
    group_description?: string;
    group_messaging_policy?: string;
  };
  members: ChatMember[];
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.success === false) {
    throw new Error(data?.message ?? `Request failed: ${response.status}`);
  }
  return data as T;
}

export const webApi = {
  createSession: () => request<{ success: true; token: string; expiresAt: string }>("/web-session", { method: "POST" }),
  sessionStatus: (token: string) => request<{ success: true; status: SessionStatus; user?: WebUser }>(`/web-session/${token}/status`),
  chats: (token: string) => request<{ success: true; chats: ChatEntry[]; userId: number }>(`/web-session/${token}/chats`),
  messages: (token: string, chatId: number, before?: string) => {
    const qs = before ? `?before=${encodeURIComponent(before)}` : "";
    return request<{ success: true; messages: Message[] }>(`/web-session/${token}/chats/${chatId}/messages${qs}`);
  },
  uploadMedia: async (token: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<{ success: true; url: string; mimeType: string; size: number }>(`/web-session/${token}/media`, {
      method: "POST",
      body: form,
    });
  },
  sendMessage: (token: string, chatId: number, payload: { content?: string; type?: string; mediaUrl?: string }) =>
    request<{ success: true; message: Message }>(`/web-session/${token}/chats/${chatId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  markRead: (token: string, chatId: number) => request<{ success: true }>(`/web-session/${token}/chats/${chatId}/read`, { method: "POST" }),
  setTyping: (token: string, chatId: number, active: boolean) =>
    request<{ success: true }>(`/web-session/${token}/chats/${chatId}/typing`, { method: active ? "POST" : "DELETE" }),
  getTyping: (token: string, chatId: number) => request<{ success: true; typing: ChatMember[] }>(`/web-session/${token}/chats/${chatId}/typing`),
  deleteMessage: (token: string, chatId: number, messageId: number) =>
    request<{ success: true }>(`/web-session/${token}/chats/${chatId}/messages/${messageId}`, { method: "DELETE" }),
  starMessage: (token: string, chatId: number, messageId: number) =>
    request<{ success: true; isStarred: boolean }>(`/web-session/${token}/chats/${chatId}/messages/${messageId}/star`, { method: "POST" }),
  reactMessage: (token: string, chatId: number, messageId: number, emoji: string) =>
    request<{ success: true }>(`/web-session/${token}/chats/${chatId}/messages/${messageId}/react`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emoji }),
    }),
  details: (token: string, chatId: number) => request<{ success: true } & ChatDetails>(`/web-session/${token}/chats/${chatId}/details`),
  mute: (token: string, chatId: number, muted: boolean) =>
    request<{ success: true; isMuted: boolean }>(`/web-session/${token}/chats/${chatId}/mute`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ muted }),
    }),
  archive: (token: string, chatId: number, archived: boolean) =>
    request<{ success: true; isArchived: boolean }>(`/web-session/${token}/chats/${chatId}/archive`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived }),
    }),
  logout: (token: string) => request<{ success: true }>(`/web-session/${token}`, { method: "DELETE" }),
};

export function eventsUrl(token: string): string {
  return `/api/web-session/${token}/events`;
}

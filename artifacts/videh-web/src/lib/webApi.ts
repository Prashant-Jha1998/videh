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
  is_archived?: boolean;
  other_members?: ChatMember[];
};

export type CallLogEntry = {
  id: number;
  chat_id?: number | null;
  type: string;
  status: string;
  direction: "incoming" | "outgoing";
  other_user_id?: number;
  other_user_name?: string;
  other_user_avatar?: string;
  started_at?: string;
  ended_at?: string;
  duration_seconds?: number;
  created_at: string;
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

export type WebStatus = {
  id: number;
  user_id: number;
  content: string;
  type: string;
  background_color?: string;
  media_url?: string;
  expires_at: string;
  created_at: string;
  user_name: string;
  user_avatar?: string;
  viewed: boolean;
};

export type StarredMessage = {
  id: number;
  chat_id: number;
  content: string;
  type: string;
  media_url?: string;
  created_at: string;
  is_group: boolean;
  group_name?: string;
  sender_name?: string;
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
  forwardMessage: (token: string, sourceChatId: number, messageId: number, targetChatId: number) =>
    request<{ success: true; message: Message }>(`/web-session/${token}/chats/${sourceChatId}/messages/${messageId}/forward`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetChatId }),
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
  searchUsers: (token: string, q: string) =>
    request<{ success: true; users: ChatMember[] }>(`/web-session/${token}/users/search?q=${encodeURIComponent(q)}`),
  contacts: (token: string, q?: string) => {
    const qs = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
    return request<{ success: true; users: ChatMember[] }>(`/web-session/${token}/contacts${qs}`);
  },
  statuses: (token: string) =>
    request<{ success: true; statuses: WebStatus[] }>(`/web-session/${token}/statuses`),
  viewStatus: (token: string, statusId: number) =>
    request<{ success: true }>(`/web-session/${token}/statuses/${statusId}/view`, { method: "POST" }),
  uploadStatusMedia: async (token: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<{ success: true; url: string; mimeType: string; size: number }>(
      `/web-session/${token}/statuses/media`,
      { method: "POST", body: form },
    );
  },
  createStatus: (
    token: string,
    payload: {
      content: string;
      type?: string;
      backgroundColor?: string;
      mediaUrl?: string;
      videoDurationMs?: number;
    },
  ) =>
    request<{ success: true; status: WebStatus }>(`/web-session/${token}/statuses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  statusViewers: (token: string, statusId: number) =>
    request<{
      success: true;
      viewers: Array<{ id: number; name: string; avatar?: string; viewed_at: string; reaction?: string }>;
      viewCount: number;
      reactions: Record<string, number>;
    }>(`/web-session/${token}/statuses/${statusId}/viewers`),
  deleteStatus: (token: string, statusId: number) =>
    request<{ success: true }>(`/web-session/${token}/statuses/${statusId}`, { method: "DELETE" }),
  statusBoostQuote: (params: { durationDays: number; radiusKm: number; targetCity?: string; targetState?: string }) => {
    const qs = new URLSearchParams({
      durationDays: String(params.durationDays),
      radiusKm: String(params.radiusKm),
    });
    if (params.targetCity?.trim()) qs.set("targetCity", params.targetCity.trim());
    if (params.targetState?.trim()) qs.set("targetState", params.targetState.trim());
    return request<{
      success: true;
      plan: { amountInr: number; durationDays: number; radiusKm: number; estimatedReach: number };
      razorpayKeyId: string | null;
      note: string;
    }>(`/statuses/boost/quote?${qs.toString()}`);
  },
  statusBoostOrder: (
    token: string,
    statusId: number,
    plan: { durationDays: number; radiusKm: number; targetCity?: string; targetState?: string },
  ) =>
    request<{
      success: true;
      keyId: string;
      order: { id: string; amount: number; currency: string };
      plan: { amountInr: number; durationDays: number; radiusKm: number; estimatedReach: number };
    }>(`/web-session/${token}/statuses/${statusId}/boost/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(plan),
    }),
  statusBoostConfirm: (
    token: string,
    statusId: number,
    payload: {
      amountInr: number;
      durationDays: number;
      radiusKm: number;
      targetCity?: string;
      targetState?: string;
      razorpayOrderId: string;
      razorpayPaymentId: string;
      razorpaySignature: string;
    },
  ) =>
    request<{
      success: true;
      boost: Record<string, unknown>;
      plan: { amountInr: number; durationDays: number; radiusKm: number; estimatedReach: number };
      message: string;
    }>(`/web-session/${token}/statuses/${statusId}/boost`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  statusBoostInfo: (token: string, statusId: number) =>
    request<{
      success: true;
      boost: {
        id: number;
        status: string;
        payment_status: string;
        amount_inr: number;
        duration_days: number;
        target_radius_km: number;
        target_city: string | null;
        target_state: string | null;
        estimated_reach: number;
        verification_note: string | null;
        created_at: string;
        starts_at: string | null;
        ends_at: string;
      } | null;
      plan: { amountInr: number; durationDays: number; radiusKm: number; estimatedReach: number } | null;
    }>(`/web-session/${token}/statuses/${statusId}/boost`),
  statusBoostAnalytics: (token: string, statusId: number) =>
    request<{
      success: true;
      boost: Record<string, unknown>;
      boostedViewCount: number;
      viewers: Array<{ id: number; name: string; viewedAt: string }>;
    }>(`/web-session/${token}/statuses/${statusId}/boost/analytics`),
  starredMessages: (token: string) =>
    request<{ success: true; messages: StarredMessage[] }>(`/web-session/${token}/starred`),
  callLogs: (token: string) =>
    request<{ success: true; calls: CallLogEntry[] }>(`/web-session/${token}/calls`),
  markAllRead: (token: string) =>
    request<{ success: true }>(`/web-session/${token}/chats/read-all`, { method: "POST" }),
  createDirectChat: (token: string, otherUserId: number) =>
    request<{ success: true; chatId: number }>(`/web-session/${token}/chats/direct`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ otherUserId }),
    }),
  createGroup: (token: string, name: string, memberIds: number[]) =>
    request<{ success: true; chatId: number }>(`/web-session/${token}/groups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, memberIds }),
    }),
  updateProfile: (token: string, payload: { name?: string; about?: string }) =>
    request<{ success: true; user: WebUser }>(`/web-session/${token}/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  privacy: (token: string) =>
    request<{ success: true } & import("./webSettingsTypes").WebPrivacySettings>(`/web-session/${token}/privacy`),
  patchPrivacy: (
    token: string,
    patch: Partial<{
      profilePhotoPrivacy: string;
      aboutPrivacy: string;
      statusPrivacy: string;
      groupsPrivacy: string;
      readReceiptsEnabled: boolean;
      defaultDisappearSeconds: number | null;
      silenceUnknownCallers: boolean;
      lastSeenPrivacy: string;
      onlinePrivacy: string;
    }>,
  ) =>
    request<{ success: true } & import("./webSettingsTypes").WebPrivacySettings>(`/web-session/${token}/privacy`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),
  blocked: (token: string) =>
    request<{ success: true; blocked: Array<{ id: number; name?: string | null; phone?: string; avatar_url?: string | null }> }>(
      `/web-session/${token}/blocked`,
    ),
  unblock: (token: string, blockedUserId: number) =>
    request<{ success: true }>(`/web-session/${token}/blocked/${blockedUserId}`, { method: "DELETE" }),
  twoStepStatus: (token: string) => request<{ success: true; enabled: boolean }>(`/web-session/${token}/two-step-status`),
  setTwoStepPin: (token: string, pin: string) =>
    request<{ success: true }>(`/web-session/${token}/two-step-pin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    }),
  removeTwoStepPin: (token: string, pin: string) =>
    request<{ success: true }>(`/web-session/${token}/two-step-pin`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    }),
  linkedDevices: (token: string) =>
    request<{
      success: true;
      devices: Array<{ token: string; device_name: string; platform: string; linked_at: string; last_active: string }>;
    }>(`/web-session/${token}/devices`),
  logoutDevice: (deviceToken: string) => request<{ success: true }>(`/web-session/${deviceToken}`, { method: "DELETE" }),
  storageStats: (token: string) =>
    request<{
      success: true;
      stats: { total_chats: number; total_messages: number; media_messages: number; text_messages: number };
    }>(`/web-session/${token}/storage-stats`),
  sosContacts: (token: string) =>
    request<{
      success: true;
      contacts: Array<{ id: number; contact_name: string; contact_phone: string | null; linked_name: string | null }>;
    }>(`/web-session/${token}/sos/contacts`),
  addSosContact: (token: string, payload: { contactName: string; contactPhone?: string }) =>
    request<{ success: true }>(`/web-session/${token}/sos/contacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  removeSosContact: (token: string, contactId: number) =>
    request<{ success: true }>(`/web-session/${token}/sos/contacts/${contactId}`, { method: "DELETE" }),
  setLanguage: (token: string, preferredLang: string) =>
    request<{ success: true }>(`/web-session/${token}/language`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferredLang }),
    }),
};

export function eventsUrl(token: string): string {
  return `/api/web-session/${token}/events`;
}

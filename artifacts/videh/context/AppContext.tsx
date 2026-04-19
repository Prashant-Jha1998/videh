import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

const BASE_URL = (() => {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  return domain ? `https://${domain}` : "";
})();

const api = async (path: string, options?: RequestInit) => {
  const res = await fetch(`${BASE_URL}/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  return res.json();
};

export interface UserProfile {
  id: string;
  dbId?: number;
  name: string;
  phone: string;
  about: string;
  avatar?: string;
}

export interface Message {
  id: string;
  text: string;
  timestamp: number;
  senderId: string;
  type: "text" | "image" | "audio" | "deleted";
  status: "sent" | "delivered" | "read";
  isStarred?: boolean;
  chatId?: string;
  chatName?: string;
  replyToId?: string;
  replyText?: string;
}

export interface Chat {
  id: string;
  name: string;
  avatar?: string;
  lastMessage?: string;
  lastMessageTime?: number;
  unreadCount: number;
  isGroup: boolean;
  isOnline?: boolean;
  members?: string[];
  messages: Message[];
  isPinned?: boolean;
  isMuted?: boolean;
  otherUserId?: number;
}

export interface Status {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  content: string;
  type: "text" | "image" | "video";
  mediaUrl?: string;
  timestamp: number;
  viewed: boolean;
  backgroundColor?: string;
}

export interface Contact {
  id: string;
  name: string;
  phone: string;
  avatar?: string;
  isOnVideh: boolean;
  isBlocked?: boolean;
}

export interface CallLog {
  id: string;
  name: string;
  phone?: string;
  avatar?: string;
  type: "audio" | "video";
  direction: "incoming" | "outgoing";
  status: "answered" | "missed" | "declined";
  timestamp: number;
  duration?: number;
}

interface AppContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  chats: Chat[];
  statuses: Status[];
  contacts: Contact[];
  callLogs: CallLog[];
  setUser: (user: UserProfile) => Promise<void>;
  logout: () => Promise<void>;
  sendMessage: (chatId: string, text: string, replyToId?: string) => void;
  createGroup: (name: string, memberIds: string[]) => void;
  markAsRead: (chatId: string) => void;
  addStatus: (content: string, type: "text" | "image" | "video", bg?: string, mediaUrl?: string) => Promise<void> | undefined;
  deleteMessage: (chatId: string, messageId: string) => void;
  pinChat: (chatId: string) => void;
  muteChat: (chatId: string) => void;
  archiveChat: (chatId: string) => void;
  starMessage: (chatId: string, messageId: string) => void;
  forwardMessage: (chatId: string, messageId: string, targetChatId: string) => void;
  starredMessages: Message[];
  updateAvatar: (base64: string, mimeType?: string) => Promise<void>;
  createDirectChat: (otherUserId: number, otherName: string, otherAvatar?: string) => Promise<string>;
  loadMessages: (chatId: string) => Promise<void>;
  refreshChats: () => Promise<void>;
}

const AppContext = createContext<AppContextType | null>(null);


export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<UserProfile | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [chats, setChats] = useState<Chat[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [contacts] = useState<Contact[]>([]);
  const [callLogs] = useState<CallLog[]>([]);
  const userRef = useRef<UserProfile | null>(null);
  userRef.current = user;

  const mapDbChats = (rows: any[]): Chat[] =>
    rows.map((c: any) => {
      const otherUser = c.other_members?.[0];
      const lastMsg = c.last_message;
      return {
        id: String(c.id),
        name: c.is_group ? (c.group_name ?? "Group") : (otherUser?.name ?? "Unknown"),
        avatar: c.is_group ? c.group_avatar_url : otherUser?.avatar_url,
        lastMessage: lastMsg
          ? lastMsg.is_deleted
            ? "This message was deleted"
            : lastMsg.content
          : undefined,
        lastMessageTime: lastMsg ? new Date(lastMsg.created_at).getTime() : undefined,
        unreadCount: c.unread_count ?? 0,
        isGroup: c.is_group,
        isOnline: otherUser?.is_online ?? false,
        messages: [],
        isPinned: c.is_pinned ?? false,
        isMuted: c.is_muted ?? false,
        otherUserId: otherUser?.id,
      };
    });

  const loadChats = useCallback(async (dbUserId: number) => {
    try {
      const data = await api(`/chats/user/${dbUserId}`) as { success: boolean; chats: any[] };
      if (!data.success || !data.chats) return;
      setChats(mapDbChats(data.chats));
    } catch {}
  }, []);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const stored = await AsyncStorage.getItem("videh_user");
        if (stored) {
          const parsed = JSON.parse(stored) as UserProfile;
          setUserState(parsed);
          setIsAuthenticated(true);
          if (parsed.dbId) {
            loadChats(parsed.dbId);
          }
        }
      } catch {}
    };
    loadUser();
  }, []);

  const setUser = useCallback(async (u: UserProfile) => {
    setUserState(u);
    setIsAuthenticated(true);
    await AsyncStorage.setItem("videh_user", JSON.stringify(u));

    if (u.dbId) {
      loadChats(u.dbId);
      try {
        await api(`/users/${u.dbId}`, {
          method: "PUT",
          body: JSON.stringify({ name: u.name, about: u.about }),
        });
      } catch {}
    }
  }, [loadChats]);

  const refreshChats = useCallback(async () => {
    const u = userRef.current;
    if (u?.dbId) await loadChats(u.dbId);
  }, [loadChats]);

  const updateAvatar = useCallback(async (base64: string, mimeType = "image/jpeg") => {
    const u = userRef.current;
    if (!u?.dbId) {
      const updated = { ...u!, avatar: `data:${mimeType};base64,${base64}` };
      setUserState(updated);
      await AsyncStorage.setItem("videh_user", JSON.stringify(updated));
      return;
    }
    try {
      const data = await api(`/users/${u.dbId}/avatar`, {
        method: "POST",
        body: JSON.stringify({ base64, mimeType }),
      }) as { success: boolean; avatarUrl?: string };

      if (data.success && data.avatarUrl) {
        const updated = { ...u, avatar: data.avatarUrl };
        setUserState(updated);
        await AsyncStorage.setItem("videh_user", JSON.stringify(updated));
      }
    } catch {
      const updated = { ...u, avatar: `data:${mimeType};base64,${base64}` };
      setUserState(updated);
      await AsyncStorage.setItem("videh_user", JSON.stringify(updated));
    }
  }, []);

  const logout = useCallback(async () => {
    const u = userRef.current;
    if (u?.dbId) {
      try { await api(`/users/${u.dbId}/offline`, { method: "POST" }); } catch {}
    }
    setUserState(null);
    setIsAuthenticated(false);
    setChats([]);
    await AsyncStorage.removeItem("videh_user");
  }, []);

  // Create or get a direct chat in DB and return its ID
  const createDirectChat = useCallback(async (otherUserId: number, otherName: string, otherAvatar?: string): Promise<string> => {
    const u = userRef.current;
    if (!u?.dbId) throw new Error("Not authenticated");

    // Check if we already have this chat locally
    const existing = chats.find((c) => !c.isGroup && c.otherUserId === otherUserId);
    if (existing) return existing.id;

    const data = await api("/chats/direct", {
      method: "POST",
      body: JSON.stringify({ userId: u.dbId, otherUserId }),
    }) as { success: boolean; chatId?: number };

    if (!data.success || !data.chatId) throw new Error("Failed to create chat");

    const realId = String(data.chatId);

    // Add or update in local state
    setChats((prev) => {
      const idx = prev.findIndex((c) => c.id === realId);
      if (idx !== -1) return prev;
      return [{
        id: realId,
        name: otherName,
        avatar: otherAvatar,
        unreadCount: 0,
        isGroup: false,
        messages: [],
        isPinned: false,
        isMuted: false,
        otherUserId,
      }, ...prev];
    });

    return realId;
  }, [chats]);

  // Load messages for a chat from DB
  const loadMessages = useCallback(async (chatId: string) => {
    try {
      const data = await api(`/chats/${chatId}/messages?limit=60`) as { success: boolean; messages: any[] };
      if (!data.success || !data.messages) return;

      const u = userRef.current;
      const msgs: Message[] = data.messages.map((m: any) => ({
        id: String(m.id),
        text: m.is_deleted ? "This message was deleted" : (m.content ?? ""),
        timestamp: new Date(m.created_at).getTime(),
        senderId: String(m.sender_id) === String(u?.dbId) ? "me" : String(m.sender_id),
        type: m.is_deleted ? "deleted" : (m.type ?? "text"),
        status: "delivered",
        isStarred: m.is_starred,
        replyToId: m.reply_to_id ? String(m.reply_to_id) : undefined,
        replyText: m.reply_content ?? undefined,
      }));

      setChats((prev) =>
        prev.map((c) => c.id === chatId ? { ...c, messages: msgs } : c)
      );
    } catch {}
  }, []);

  const sendMessage = useCallback((chatId: string, text: string, replyToId?: string) => {
    if (!text.trim()) return;
    const u = userRef.current;
    const tempId = "tmp_" + Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const newMsg: Message = {
      id: tempId,
      text,
      timestamp: Date.now(),
      senderId: "me",
      type: "text",
      status: "sent",
      replyToId,
    };
    setChats((prev) =>
      prev.map((c) =>
        c.id === chatId
          ? { ...c, messages: [...c.messages, newMsg], lastMessage: text, lastMessageTime: Date.now() }
          : c
      )
    );

    if (u?.dbId) {
      api(`/chats/${chatId}/messages`, {
        method: "POST",
        body: JSON.stringify({ senderId: u.dbId, content: text, type: "text", replyToId: replyToId ? Number(replyToId) : undefined }),
      }).then((data: any) => {
        if (data?.success && data.message) {
          // Replace temp message with DB message
          setChats((prev) =>
            prev.map((c) =>
              c.id === chatId
                ? { ...c, messages: c.messages.map((m) => m.id === tempId ? { ...m, id: String(data.message.id), status: "delivered" } : m) }
                : c
            )
          );
        }
      }).catch(() => {});
    }
  }, []);

  const markAsRead = useCallback((chatId: string) => {
    setChats((prev) => prev.map((c) => c.id === chatId ? { ...c, unreadCount: 0 } : c));
    const u = userRef.current;
    if (u?.dbId) {
      api(`/chats/${chatId}/read`, {
        method: "POST",
        body: JSON.stringify({ userId: u.dbId }),
      }).catch(() => {});
    }
  }, []);

  const createGroup = useCallback((name: string, memberIds: string[]) => {
    const u = userRef.current;
    if (!u?.dbId) return;
    api("/chats/group", {
      method: "POST",
      body: JSON.stringify({ creatorId: u.dbId, name, memberIds: memberIds.map(Number) }),
    }).then((data: any) => {
      if (data?.success && data.chatId) {
        setChats((prev) => [{
          id: String(data.chatId), name, unreadCount: 0, isGroup: true,
          members: memberIds, messages: [], isPinned: false, isMuted: false,
        }, ...prev]);
      }
    }).catch(() => {});
  }, []);

  const addStatus = useCallback((content: string, type: "text" | "image" | "video", bg?: string, mediaUrl?: string) => {
    const u = userRef.current;
    if (!u) return;
    const newStatus: Status = {
      id: Date.now().toString(), userId: "me", userName: u.name,
      userAvatar: u.avatar,
      content, type, mediaUrl, timestamp: Date.now(), viewed: false,
      backgroundColor: bg ?? "#00A884",
    };
    setStatuses((prev) => [newStatus, ...prev]);

    if (u.dbId) {
      api("/statuses", {
        method: "POST",
        body: JSON.stringify({ userId: u.dbId, content, type, backgroundColor: bg ?? "#00A884", mediaUrl: mediaUrl ?? null }),
      }).catch(() => {});
    }
    return Promise.resolve();
  }, []);

  const deleteMessage = useCallback((chatId: string, messageId: string) => {
    setChats((prev) =>
      prev.map((c) =>
        c.id === chatId
          ? { ...c, messages: c.messages.map((m) => m.id === messageId ? { ...m, type: "deleted" as const, text: "This message was deleted" } : m) }
          : c
      )
    );
    const u = userRef.current;
    if (u?.dbId) {
      api(`/chats/${chatId}/messages/${messageId}`, {
        method: "DELETE",
        body: JSON.stringify({ userId: u.dbId }),
      }).catch(() => {});
    }
  }, []);

  const pinChat = useCallback((chatId: string) => {
    setChats((prev) => prev.map((c) => c.id === chatId ? { ...c, isPinned: !c.isPinned } : c));
  }, []);

  const muteChat = useCallback((chatId: string) => {
    setChats((prev) => prev.map((c) => c.id === chatId ? { ...c, isMuted: !c.isMuted } : c));
  }, []);

  const archiveChat = useCallback((chatId: string) => {
    setChats((prev) => prev.filter((c) => c.id !== chatId));
  }, []);

  const starMessage = useCallback((chatId: string, messageId: string) => {
    setChats((prev) =>
      prev.map((c) =>
        c.id === chatId
          ? {
              ...c,
              messages: c.messages.map((m) =>
                m.id === messageId
                  ? { ...m, isStarred: !m.isStarred, chatId, chatName: c.name }
                  : m
              ),
            }
          : c
      )
    );
    api(`/chats/${chatId}/messages/${messageId}/star`, { method: "POST" }).catch(() => {});
  }, []);

  const forwardMessage = useCallback((chatId: string, messageId: string, targetChatId: string) => {
    const sourceChat = chats.find((c) => c.id === chatId);
    const msg = sourceChat?.messages.find((m) => m.id === messageId);
    if (msg && targetChatId) {
      sendMessage(targetChatId, `↗ Forwarded: ${msg.text}`);
    }
  }, [chats, sendMessage]);

  const starredMessages = chats.flatMap((c) => c.messages.filter((m) => m.isStarred));

  return (
    <AppContext.Provider value={{
      user, isAuthenticated, chats, statuses, contacts, callLogs,
      setUser, logout, sendMessage, createGroup, markAsRead,
      addStatus, deleteMessage, pinChat, muteChat, archiveChat,
      starMessage, forwardMessage, starredMessages, updateAvatar,
      createDirectChat, loadMessages, refreshChats,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

export interface UserProfile {
  id: string;
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
}

export interface Status {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  content: string;
  type: "text" | "image";
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

interface AppContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  chats: Chat[];
  statuses: Status[];
  contacts: Contact[];
  setUser: (user: UserProfile) => void;
  logout: () => void;
  sendMessage: (chatId: string, text: string) => void;
  createGroup: (name: string, memberIds: string[]) => void;
  markAsRead: (chatId: string) => void;
  addStatus: (content: string, type: "text" | "image", bg?: string) => void;
  deleteMessage: (chatId: string, messageId: string) => void;
  pinChat: (chatId: string) => void;
  muteChat: (chatId: string) => void;
  archiveChat: (chatId: string) => void;
}

const AppContext = createContext<AppContextType | null>(null);

const SAMPLE_CONTACTS: Contact[] = [
  { id: "c1", name: "Priya Sharma", phone: "+919876543210", isOnVideh: true, avatar: undefined },
  { id: "c2", name: "Rahul Verma", phone: "+919123456789", isOnVideh: true, avatar: undefined },
  { id: "c3", name: "Anita Singh", phone: "+918765432109", isOnVideh: true, avatar: undefined },
  { id: "c4", name: "Deepak Kumar", phone: "+917654321098", isOnVideh: true, avatar: undefined },
  { id: "c5", name: "Sneha Patel", phone: "+916543210987", isOnVideh: false, avatar: undefined },
  { id: "c6", name: "Vikas Gupta", phone: "+915432109876", isOnVideh: true, avatar: undefined },
];

const SAMPLE_CHATS: Chat[] = [
  {
    id: "ch1",
    name: "Priya Sharma",
    lastMessage: "Hey! Are you free today? 😊",
    lastMessageTime: Date.now() - 5 * 60 * 1000,
    unreadCount: 2,
    isGroup: false,
    isOnline: true,
    isPinned: true,
    isMuted: false,
    messages: [
      { id: "m1", text: "Hi there!", timestamp: Date.now() - 30 * 60 * 1000, senderId: "c1", type: "text", status: "read" },
      { id: "m2", text: "Hey! Are you free today? 😊", timestamp: Date.now() - 5 * 60 * 1000, senderId: "c1", type: "text", status: "delivered" },
    ],
  },
  {
    id: "ch2",
    name: "Family Group",
    lastMessage: "Rahul: Dinner at 8?",
    lastMessageTime: Date.now() - 20 * 60 * 1000,
    unreadCount: 5,
    isGroup: true,
    members: ["c1", "c2", "c3"],
    isPinned: false,
    isMuted: false,
    messages: [
      { id: "m3", text: "Good morning family!", timestamp: Date.now() - 2 * 60 * 60 * 1000, senderId: "c1", type: "text", status: "read" },
      { id: "m4", text: "Dinner at 8?", timestamp: Date.now() - 20 * 60 * 1000, senderId: "c2", type: "text", status: "delivered" },
    ],
  },
  {
    id: "ch3",
    name: "Rahul Verma",
    lastMessage: "Ok bro 👍",
    lastMessageTime: Date.now() - 2 * 60 * 60 * 1000,
    unreadCount: 0,
    isGroup: false,
    isOnline: false,
    isPinned: false,
    isMuted: true,
    messages: [
      { id: "m5", text: "Meeting at 3pm?", timestamp: Date.now() - 3 * 60 * 60 * 1000, senderId: "me", type: "text", status: "read" },
      { id: "m6", text: "Ok bro 👍", timestamp: Date.now() - 2 * 60 * 60 * 1000, senderId: "c2", type: "text", status: "read" },
    ],
  },
  {
    id: "ch4",
    name: "Work Team",
    lastMessage: "Anita: Please review the docs",
    lastMessageTime: Date.now() - 5 * 60 * 60 * 1000,
    unreadCount: 0,
    isGroup: true,
    members: ["c3", "c4", "c6"],
    isPinned: false,
    isMuted: false,
    messages: [
      { id: "m7", text: "Please review the docs", timestamp: Date.now() - 5 * 60 * 60 * 1000, senderId: "c3", type: "text", status: "read" },
    ],
  },
  {
    id: "ch5",
    name: "Deepak Kumar",
    lastMessage: "Call me when free",
    lastMessageTime: Date.now() - 24 * 60 * 60 * 1000,
    unreadCount: 0,
    isGroup: false,
    isOnline: true,
    isPinned: false,
    isMuted: false,
    messages: [
      { id: "m8", text: "Call me when free", timestamp: Date.now() - 24 * 60 * 60 * 1000, senderId: "c4", type: "text", status: "read" },
    ],
  },
];

const SAMPLE_STATUSES: Status[] = [
  {
    id: "s1",
    userId: "c1",
    userName: "Priya Sharma",
    content: "Beautiful morning! ☀️",
    type: "text",
    timestamp: Date.now() - 30 * 60 * 1000,
    viewed: false,
    backgroundColor: "#005C4B",
  },
  {
    id: "s2",
    userId: "c2",
    userName: "Rahul Verma",
    content: "At the gym 💪",
    type: "text",
    timestamp: Date.now() - 1 * 60 * 60 * 1000,
    viewed: false,
    backgroundColor: "#00A884",
  },
  {
    id: "s3",
    userId: "c4",
    userName: "Deepak Kumar",
    content: "Working from home today",
    type: "text",
    timestamp: Date.now() - 2 * 60 * 60 * 1000,
    viewed: true,
    backgroundColor: "#1A1A2E",
  },
];

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<UserProfile | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [chats, setChats] = useState<Chat[]>(SAMPLE_CHATS);
  const [statuses, setStatuses] = useState<Status[]>(SAMPLE_STATUSES);
  const [contacts] = useState<Contact[]>(SAMPLE_CONTACTS);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const stored = await AsyncStorage.getItem("videh_user");
        if (stored) {
          const parsed = JSON.parse(stored);
          setUserState(parsed);
          setIsAuthenticated(true);
        }
      } catch {}
    };
    loadUser();
  }, []);

  const setUser = useCallback(async (u: UserProfile) => {
    setUserState(u);
    setIsAuthenticated(true);
    await AsyncStorage.setItem("videh_user", JSON.stringify(u));
  }, []);

  const logout = useCallback(async () => {
    setUserState(null);
    setIsAuthenticated(false);
    await AsyncStorage.removeItem("videh_user");
  }, []);

  const sendMessage = useCallback((chatId: string, text: string) => {
    if (!text.trim()) return;
    const newMsg: Message = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      text,
      timestamp: Date.now(),
      senderId: "me",
      type: "text",
      status: "sent",
    };
    setChats((prev) =>
      prev.map((c) =>
        c.id === chatId
          ? { ...c, messages: [...c.messages, newMsg], lastMessage: text, lastMessageTime: Date.now() }
          : c
      )
    );
  }, []);

  const markAsRead = useCallback((chatId: string) => {
    setChats((prev) =>
      prev.map((c) =>
        c.id === chatId ? { ...c, unreadCount: 0 } : c
      )
    );
  }, []);

  const createGroup = useCallback((name: string, memberIds: string[]) => {
    const newGroup: Chat = {
      id: Date.now().toString(),
      name,
      unreadCount: 0,
      isGroup: true,
      members: memberIds,
      messages: [],
      isPinned: false,
      isMuted: false,
    };
    setChats((prev) => [newGroup, ...prev]);
  }, []);

  const addStatus = useCallback((content: string, type: "text" | "image", bg?: string) => {
    if (!user) return;
    const newStatus: Status = {
      id: Date.now().toString(),
      userId: "me",
      userName: user.name,
      content,
      type,
      timestamp: Date.now(),
      viewed: false,
      backgroundColor: bg ?? "#00A884",
    };
    setStatuses((prev) => [newStatus, ...prev]);
  }, [user]);

  const deleteMessage = useCallback((chatId: string, messageId: string) => {
    setChats((prev) =>
      prev.map((c) =>
        c.id === chatId
          ? { ...c, messages: c.messages.map((m) => m.id === messageId ? { ...m, type: "deleted" as const, text: "This message was deleted" } : m) }
          : c
      )
    );
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

  return (
    <AppContext.Provider value={{
      user, isAuthenticated, chats, statuses, contacts,
      setUser, logout, sendMessage, createGroup, markAsRead,
      addStatus, deleteMessage, pinChat, muteChat, archiveChat,
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

import { useEffect, useRef, useState, useCallback } from "react";
import { MessageSquarePlus, MoreVertical, Search } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import "../components/web/webShell.css";
import { webApi, type WebStatus, type WebUser } from "../lib/webApi";
import { DropdownMenu, EmojiPicker, useClickOutside } from "../components/web/WebOverlays";
import { WebNavRail } from "../components/web/WebNavRail";
import { WebContactPicker, type ContactPickerMode } from "../components/web/WebContactPicker";
import { WebContactInfo } from "../components/web/WebContactInfo";
import { WebChatImage, WebChatVideo } from "../components/web/WebChatMedia";
import { WebStatusPanel } from "../components/web/WebStatusPanel";
import { WebStatusDetailPane } from "../components/web/WebStatusDetailPane";
import { WebStarredPanel } from "../components/web/WebStarredPanel";
import { WebFilterChips } from "../components/web/WebFilterChips";
import { WebEmptyPane } from "../components/web/WebEmptyPane";
import { WebCallsListPane } from "../components/web/WebCallsListPane";
import { WebSettingsPane } from "../components/web/WebSettingsPane";
import { WebSettingsDetail } from "../components/web/settings/WebSettingsDetail";
import type { SettingsSectionId } from "../lib/webSettingsTypes";
import { WebDocumentBubble } from "../components/web/WebDocumentBubble";
import { WebCallMessageBubble } from "../components/web/WebCallMessageBubble";
import { parseCallMessageMeta } from "../lib/callMessage";
import { Avatar, initials, hue } from "../components/web/webUiShared";
import type { CallLogEntry, ChatMember } from "../lib/webApi";
import type { WebSection } from "../lib/webDesktop";
import { isDocumentMessage } from "../lib/documentMessage";
import { highlightMatches } from "../lib/highlightText";
import { inferListPreview } from "../lib/messagePreview";

const FAV_CHATS_KEY = "videh_web_favorite_chats";

const API = "";

interface ChatEntry {
  id: number;
  is_group: boolean;
  group_name?: string;
  other_members?: { id: number; name: string; avatar_url?: string; is_online: boolean; about?: string; phone?: string }[];
  last_message?: { content: string; type?: string; media_url?: string; created_at: string; is_deleted: boolean; sender_id: number };
  unread_count: number;
  is_pinned?: boolean;
  is_muted?: boolean;
  is_archived?: boolean;
}

interface Msg {
  id: number;
  chat_id: number;
  sender_id: number;
  content: string;
  type: string;
  media_url?: string;
  is_deleted: boolean;
  created_at: string;
  sender_name?: string;
}

type SessionStatus = "loading" | "pending" | "scanning" | "linked" | "expired" | "error";
type SidebarView = "chats" | "status" | "contacts-direct" | "contacts-group" | "group-name" | "starred";

export default function VidehWeb() {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [token, setToken] = useState<string | null>(null);
  const [qrData, setQrData] = useState<string>("");
  const [user, setUser] = useState<WebUser | null>(null);
  const [chats, setChats] = useState<ChatEntry[]>([]);
  const [activeChatId, setActiveChatId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [msgText, setMsgText] = useState("");
  const [search, setSearch] = useState("");
  const [mainSection, setMainSection] = useState<WebSection>("chats");
  const [settingsSection, setSettingsSection] = useState<SettingsSectionId | null>(null);
  const [chatFilter, setChatFilter] = useState<"all" | "unread" | "favorites">("all");
  const [favoriteChatIds, setFavoriteChatIds] = useState<number[]>([]);
  const [callLogs, setCallLogs] = useState<CallLogEntry[]>([]);
  const [sidebarView, setSidebarView] = useState<SidebarView>("chats");
  const [sidebarMenuOpen, setSidebarMenuOpen] = useState(false);
  const [chatMenuOpen, setChatMenuOpen] = useState(false);
  const [showContactInfo, setShowContactInfo] = useState(false);
  const [contactInfoChatId, setContactInfoChatId] = useState<number | null>(null);
  const [statusFeed, setStatusFeed] = useState<WebStatus[]>([]);
  const [starredMessages, setStarredMessages] = useState<Awaited<ReturnType<typeof webApi.starredMessages>>["messages"]>([]);
  const [groupSelected, setGroupSelected] = useState<ChatMember[]>([]);
  const [groupName, setGroupName] = useState("");
  const [groupBusy, setGroupBusy] = useState(false);
  const [statusViewerUserId, setStatusViewerUserId] = useState<number | null>(null);
  const [statusDetailUserId, setStatusDetailUserId] = useState<number | null>(null);
  const [statusComposeOpen, setStatusComposeOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [chatSearchOpen, setChatSearchOpen] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const msgsEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sidebarMenuBtnRef = useRef<HTMLButtonElement>(null);
  const chatMenuBtnRef = useRef<HTMLButtonElement>(null);
  const emojiWrapRef = useRef<HTMLDivElement>(null);

  const getApiUrl = (path: string) => `${API}/api${path}`;

  // Create a new session on mount
  const createSession = useCallback(async () => {
    try {
      const res = await fetch(getApiUrl("/web-session"), { method: "POST", headers: { "Content-Type": "application/json" } });
      const data = await res.json();
      if (data.success) {
        setToken(data.token);
        // QR data encodes the session token + domain
        const domain = window.location.origin;
        setQrData(`videh://scan?token=${data.token}&host=${encodeURIComponent(domain)}`);
        setStatus("pending");
        return data.token;
      }
    } catch {
      setStatus("error");
    }
    return null;
  }, []);

  const loadStatuses = useCallback(async (tok: string) => {
    try {
      const res = await webApi.statuses(tok);
      setStatusFeed(res.statuses);
    } catch {}
  }, []);

  // Poll session status
  const pollStatus = useCallback(async (tok: string) => {
    try {
      const res = await fetch(getApiUrl(`/web-session/${tok}/status`));
      const data = await res.json();
      if (!data.success) return;
      if (data.status === "expired") { setStatus("expired"); stopPoll(); localStorage.removeItem("videh_web_token"); return; }
      if (data.status === "linked" && data.user) {
        setUser(data.user);
        setStatus("linked");
        stopPoll();
        localStorage.setItem("videh_web_token", tok);
        loadChats(tok);
        loadStatuses(tok);
      }
    } catch {}
  }, [loadStatuses]);

  const stopPoll = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  const loadChats = useCallback(async (tok: string) => {
    try {
      const res = await fetch(getApiUrl(`/web-session/${tok}/chats`));
      const data = await res.json();
      if (data.success) setChats(data.chats ?? []);
    } catch {}
  }, []);

  const loadMessages = useCallback(async (chatId: number) => {
    if (!token) return;
    try {
      const res = await fetch(getApiUrl(`/web-session/${token}/chats/${chatId}/messages`));
      const data = await res.json();
      if (data.success) setMessages(data.messages ?? []);
    } catch {}
  }, [token]);

  const sendMessage = useCallback(async () => {
    if (!token || !activeChatId || !msgText.trim()) return;
    const text = msgText.trim();
    setMsgText("");
    setEmojiOpen(false);
    try {
      await webApi.sendMessage(token, activeChatId, { content: text, type: "text" });
      await loadMessages(activeChatId);
      if (token) loadChats(token);
    } catch {}
  }, [token, activeChatId, msgText, loadMessages, loadChats]);

  const handleLogout = useCallback(async () => {
    if (!token) return;
    try {
      await webApi.logout(token);
    } catch {}
    localStorage.removeItem("videh_web_token");
    stopPoll();
    setToken(null);
    setUser(null);
    setChats([]);
    setActiveChatId(null);
    setStatus("loading");
    const tok = await createSession();
    if (tok) pollRef.current = setInterval(() => pollStatus(tok), 2000);
  }, [token, createSession, pollStatus]);

  const loadCallLogs = useCallback(async (tok: string) => {
    try {
      const res = await webApi.callLogs(tok);
      setCallLogs(res.calls ?? []);
    } catch {
      setCallLogs([]);
    }
  }, []);

  const openChatById = useCallback(async (chatId: number) => {
    if (token) await loadChats(token);
    setActiveChatId(chatId);
    setMainSection("chats");
    setSidebarView("chats");
    setSearch("");
  }, [token, loadChats]);

  const openDirectChat = useCallback(async (otherUserId: number) => {
    if (!token) return;
    try {
      const res = await webApi.createDirectChat(token, otherUserId);
      await openChatById(res.chatId);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not start chat");
    }
  }, [token, openChatById]);

  const createGroupChat = useCallback(async () => {
    if (!token || groupSelected.length === 0) return;
    setGroupBusy(true);
    try {
      const res = await webApi.createGroup(token, groupName.trim(), groupSelected.map((m) => m.id));
      setGroupSelected([]);
      setGroupName("");
      await openChatById(res.chatId);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not create group");
    } finally {
      setGroupBusy(false);
    }
  }, [token, groupName, groupSelected, openChatById]);

  const openStarred = useCallback(async () => {
    if (!token) return;
    setMainSection("starred");
    try {
      const res = await webApi.starredMessages(token);
      setStarredMessages(res.messages);
    } catch {
      setStarredMessages([]);
    }
  }, [token]);

  const handleSectionChange = useCallback(
    (section: WebSection) => {
      setMainSection(section);
      setActiveChatId(null);
      setSidebarMenuOpen(false);
      if (section !== "settings") setSettingsSection(null);
      if (section === "starred") void openStarred();
      if (section === "calls" && token) void loadCallLogs(token);
      if (section === "archived") setChatFilter("all");
      if (section === "chats" || section === "archived" || section === "status" || section === "settings" || section === "calls") {
        setSidebarView("chats");
      }
    },
    [token, openStarred, loadCallLogs],
  );

  const markAllRead = useCallback(async () => {
    if (!token) return;
    try {
      await webApi.markAllRead(token);
      await loadChats(token);
    } catch {}
  }, [token, loadChats]);

  const handleAttachments = useCallback(async (files: FileList | File[]) => {
    if (!token || !activeChatId) return;
    setUploading(true);
    try {
      const list = Array.from(files).slice(0, 30);
      for (let i = 0; i < list.length; i++) {
        const file = list[i];
        const { url, mimeType } = await webApi.uploadMedia(token, file);
        const type = mimeType.startsWith("image/") ? "image" : mimeType.startsWith("video/") ? "video" : "document";
        const label = file.name || (type === "image" ? "Photo" : type === "video" ? "Video" : "Attachment");
        await webApi.sendMessage(token, activeChatId, {
          type,
          mediaUrl: url,
          content: i === list.length - 1 ? label : (type === "image" ? "📷 Photo" : label),
        });
      }
      await loadMessages(activeChatId);
      loadChats(token);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }, [token, activeChatId, loadMessages, loadChats]);

  const toggleMute = useCallback(async () => {
    if (!token || !activeChatId) return;
    const chat = chats.find((c) => c.id === activeChatId);
    if (!chat) return;
    try {
      const muted = !chat.is_muted;
      await webApi.mute(token, activeChatId, muted);
      setChats((prev) => prev.map((c) => (c.id === activeChatId ? { ...c, is_muted: muted } : c)));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not update mute");
    }
  }, [token, activeChatId, chats]);

  const saveProfile = useCallback(async (name: string, about: string) => {
    if (!token) return;
    const res = await webApi.updateProfile(token, { name, about });
    setUser(res.user);
  }, [token]);

  const statusRingForUser = useCallback((userId: number): "unviewed" | "viewed" | null => {
    const items = statusFeed.filter((s) => s.user_id === userId);
    if (items.length === 0) return null;
    return items.some((s) => !s.viewed) ? "unviewed" : "viewed";
  }, [statusFeed]);

  const openStatusViewer = useCallback(async (userId: number) => {
    if (userId === user?.id) {
      setStatusDetailUserId(userId);
      setStatusViewerUserId(null);
      return;
    }
    setStatusDetailUserId(null);
    setStatusViewerUserId(userId);
    if (!token) return;
    const items = statusFeed.filter((s) => s.user_id === userId && !s.viewed);
    for (const s of items) {
      try {
        await webApi.viewStatus(token, s.id);
      } catch {}
    }
    if (items.length > 0) loadStatuses(token);
  }, [token, statusFeed, loadStatuses, user?.id]);

  const myStatuses = statusFeed.filter((s) => s.user_id === user?.id);

  useEffect(() => {
    if (mainSection === "status" && user && myStatuses.length > 0) {
      setStatusDetailUserId(user.id);
    }
    if (mainSection !== "status") {
      setStatusDetailUserId(null);
      setStatusViewerUserId(null);
    }
  }, [mainSection, user, myStatuses.length]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(FAV_CHATS_KEY);
      if (raw) setFavoriteChatIds(JSON.parse(raw) as number[]);
    } catch {}
  }, []);

  const toggleFavoriteChat = useCallback((chatId: number) => {
    setFavoriteChatIds((prev) => {
      const next = prev.includes(chatId) ? prev.filter((id) => id !== chatId) : [...prev, chatId];
      localStorage.setItem(FAV_CHATS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  useEffect(() => {
    const startNewSession = () => {
      createSession().then((tok) => {
        if (tok) pollRef.current = setInterval(() => pollStatus(tok), 2000);
      });
    };

    const savedToken = localStorage.getItem("videh_web_token");
    if (savedToken) {
      fetch(getApiUrl(`/web-session/${savedToken}/status`))
        .then((r) => r.json())
        .then((data) => {
          if (data.success && data.status === "linked" && data.user) {
            setToken(savedToken);
            setUser(data.user);
            setStatus("linked");
            loadChats(savedToken);
            loadStatuses(savedToken);
          } else {
            localStorage.removeItem("videh_web_token");
            startNewSession();
          }
        })
        .catch(() => { localStorage.removeItem("videh_web_token"); startNewSession(); });
    } else {
      startNewSession();
    }
    return () => stopPoll();
  }, []);

  useEffect(() => {
    if (activeChatId) loadMessages(activeChatId);
    setChatSearchOpen(false);
    setChatSearchQuery("");
    setChatMenuOpen(false);
    setEmojiOpen(false);
  }, [activeChatId]);

  useClickOutside(emojiWrapRef, () => setEmojiOpen(false), emojiOpen);

  useEffect(() => {
    msgsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Refresh messages periodically when chat is open
  useEffect(() => {
    if (!activeChatId || !token) return;
    const t = setInterval(() => loadMessages(activeChatId), 5000);
    return () => clearInterval(t);
  }, [activeChatId, token]);

  useEffect(() => {
    if (!token || status !== "linked") return;
    const t = setInterval(() => loadStatuses(token), 45000);
    return () => clearInterval(t);
  }, [token, status, loadStatuses]);

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatChatTime = (iso?: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 86400000) return formatTime(iso);
    if (diff < 172800000) return "Yesterday";
    return d.toLocaleDateString();
  };

  const getChatName = (c: ChatEntry) => c.is_group ? (c.group_name ?? "Group") : (c.other_members?.[0]?.name ?? "Unknown");
  const getChatAvatar = (c: ChatEntry) => c.is_group ? undefined : c.other_members?.[0]?.avatar_url;
  const searchLower = search.trim().toLowerCase();

  const filteredChats = chats.filter((c) => {
    if (searchLower) {
      const name = getChatName(c).toLowerCase();
      const preview = c.last_message
        ? inferListPreview(
            c.last_message.type,
            c.last_message.content,
            c.last_message.is_deleted,
            c.last_message.media_url,
          ).toLowerCase()
        : "";
      if (!name.includes(searchLower) && !preview.includes(searchLower)) return false;
    }
    const archived = Boolean(c.is_archived);
    if (mainSection === "archived") return archived;
    if (archived) return false;
    if (chatFilter === "unread") return c.unread_count > 0;
    if (chatFilter === "favorites") return favoriteChatIds.includes(c.id);
    return true;
  });

  const unreadChatCount = chats.filter((c) => !c.is_archived && c.unread_count > 0).length;
  const favCount = chats.filter((c) => !c.is_archived && favoriteChatIds.includes(c.id)).length;

  const pickerMode: ContactPickerMode | null =
    sidebarView === "contacts-direct" ? "direct"
    : sidebarView === "contacts-group" ? "group-members"
    : sidebarView === "group-name" ? "group-name"
    : null;

  const viewingStatuses = statusViewerUserId != null
    ? statusFeed
        .filter((s) => s.user_id === statusViewerUserId)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    : [];
  const activeChat = chats.find((c) => c.id === activeChatId);
  const chatSearchLower = chatSearchQuery.trim().toLowerCase();
  const displayMessages = chatSearchLower
    ? messages.filter((m) => {
        if (m.is_deleted) return false;
        const content = m.content?.toLowerCase() ?? "";
        const sender = m.sender_name?.toLowerCase() ?? "";
        return content.includes(chatSearchLower) || sender.includes(chatSearchLower);
      })
    : messages;
  const chatSearchMatchCount = chatSearchLower ? displayMessages.length : 0;

  // ─── QR LANDING ───────────────────────────────────────────────────────────
  if (status !== "linked") {
    return (
      <div style={{ minHeight: "100vh", backgroundColor: "#f0f2f5", display: "flex", flexDirection: "column" }}>
        {/* Top bar */}
        <div style={{ backgroundColor: "#00a884", padding: "12px 24px", display: "flex", alignItems: "center", gap: 10 }}>
          <img src={`${import.meta.env.BASE_URL}videh-logo.png`} alt="Videh" style={{ width: 48, height: 48, objectFit: "contain", filter: "brightness(0) invert(1)" }} />
          <span style={{ color: "white", fontWeight: 700, fontSize: 18 }}>Videh Web</span>
        </div>

        {/* Main landing */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ display: "flex", gap: 80, alignItems: "center", maxWidth: 900, width: "100%" }}>
            {/* Left: Instructions */}
            <div style={{ flex: 1 }}>
              <h1 style={{ fontSize: 28, fontWeight: 300, color: "#41525d", marginBottom: 8, lineHeight: 1.3 }}>
                Use Videh on your computer
              </h1>
              <div style={{ width: 64, height: 3, backgroundColor: "#00a884", marginBottom: 32, borderRadius: 2 }} />

              {[
                { n: 1, text: "Open Videh on your phone" },
                { n: 2, text: 'Go to Settings → Linked Devices → "Link a Device"' },
                { n: 3, text: "Point your phone camera at this screen to scan the QR code" },
              ].map((step) => (
                <div key={step.n} style={{ display: "flex", gap: 16, marginBottom: 24, alignItems: "flex-start" }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", backgroundColor: "#00a884", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ color: "white", fontWeight: 700, fontSize: 14 }}>{step.n}</span>
                  </div>
                  <p style={{ margin: 0, color: "#667781", fontSize: 15, lineHeight: 1.5, paddingTop: 4 }}>{step.text}</p>
                </div>
              ))}

              <div style={{ marginTop: 32, padding: "16px 20px", backgroundColor: "#fff", borderRadius: 12, border: "1px solid #e9edef" }}>
                <p style={{ margin: 0, color: "#667781", fontSize: 13, lineHeight: 1.6 }}>
                  💡 <strong>Tip:</strong> Keep your phone connected to the internet while using Videh Web. Your messages will sync in real time.
                </p>
              </div>
            </div>

            {/* Right: QR code */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
              <div style={{
                padding: 24,
                backgroundColor: "white",
                borderRadius: 20,
                boxShadow: "0 4px 24px rgba(0,0,0,0.1)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 16,
              }}>
                {status === "loading" && (
                  <div style={{ width: 220, height: 220, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
                    <div style={{ width: 40, height: 40, border: "3px solid #00a884", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
                    <p style={{ margin: 0, color: "#667781", fontSize: 13 }}>Generating QR code...</p>
                  </div>
                )}
                {status === "expired" && (
                  <div style={{ width: 220, height: 220, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
                    <div style={{ fontSize: 48 }}>⏰</div>
                    <p style={{ margin: 0, color: "#667781", fontSize: 14, textAlign: "center" }}>QR code expired</p>
                    <button
                      onClick={() => { setStatus("loading"); createSession().then((tok) => { if (tok) { pollRef.current = setInterval(() => pollStatus(tok), 2000); } }); }}
                      style={{ padding: "10px 20px", backgroundColor: "#00a884", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}
                    >
                      Get new code
                    </button>
                  </div>
                )}
                {(status === "pending" || status === "scanning") && qrData && (
                  <>
                    <div style={{ position: "relative" }}>
                      <QRCodeSVG
                        value={qrData}
                        size={220}
                        level="M"
                        includeMargin={false}
                        fgColor="#122"
                      />
                      {/* Videh logo overlay on QR */}
                      <div style={{
                        position: "absolute",
                        top: "50%",
                        left: "50%",
                        transform: "translate(-50%, -50%)",
                        width: 44,
                        height: 44,
                        backgroundColor: "#ffffff",
                        borderRadius: 8,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 3,
                      }}>
                        <img src={`${import.meta.env.BASE_URL}videh-logo.png`} alt="Videh" style={{ width: 38, height: 38, objectFit: "contain" }} />
                      </div>
                    </div>
                    <p style={{ margin: 0, color: "#667781", fontSize: 13, textAlign: "center", maxWidth: 200, lineHeight: 1.5 }}>
                      Scan this code with the Videh app on your phone
                    </p>
                  </>
                )}
                {status === "error" && (
                  <div style={{ width: 220, height: 220, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
                    <div style={{ fontSize: 40 }}>❌</div>
                    <p style={{ margin: 0, color: "#e53e3e", fontSize: 14, textAlign: "center" }}>Connection error. Please reload.</p>
                  </div>
                )}
              </div>

              {/* Refresh button */}
              {(status === "pending" || status === "scanning") && (
                <button
                  onClick={() => { stopPoll(); setStatus("loading"); createSession().then((tok) => { if (tok) { pollRef.current = setInterval(() => pollStatus(tok), 2000); } }); }}
                  style={{ background: "none", border: "none", color: "#00a884", cursor: "pointer", fontSize: 14, textDecoration: "underline" }}
                >
                  Refresh QR code
                </button>
              )}
            </div>
          </div>
        </div>

        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  // ─── CHAT INTERFACE ────────────────────────────────────────────────────────
  return (
    <div className="vw-app">
      <WebNavRail
        active={mainSection}
        onSectionChange={handleSectionChange}
        userAvatar={user?.avatarUrl}
        userName={user?.name ?? "Videh"}
        onProfileClick={() => { setContactInfoChatId(null); setShowContactInfo(true); }}
      />
      <div className="vw-main">
      {pickerMode && token ? (
        <WebContactPicker
          token={token}
          mode={pickerMode}
          selected={groupSelected}
          onSelectedChange={setGroupSelected}
          groupName={groupName}
          onGroupNameChange={setGroupName}
          onClose={() => { setSidebarView("chats"); setGroupSelected([]); }}
          onOpenChat={openDirectChat}
          onGroupNext={() => setSidebarView("group-name")}
          onCreateGroup={createGroupChat}
          busy={groupBusy}
        />
      ) : mainSection === "status" ? (
        <WebStatusPanel
          token={token!}
          statuses={statusFeed}
          selfId={user!.id}
          selfName={user!.name}
          selfAvatar={user?.avatarUrl}
          onSelectUser={openStatusViewer}
          onRefresh={() => {
            if (token) {
              void loadStatuses(token);
              setStatusDetailUserId(user!.id);
            }
          }}
          composeOpen={statusComposeOpen}
          onComposeOpenChange={setStatusComposeOpen}
        />
      ) : mainSection === "starred" ? (
        <WebStarredPanel messages={starredMessages} onClose={() => setMainSection("chats")} onOpenChat={openChatById} />
      ) : mainSection === "calls" ? (
        <WebCallsListPane calls={callLogs} onOpenChat={(id) => void openChatById(id)} />
      ) : mainSection === "settings" && user ? (
        <WebSettingsPane
          user={user}
          activeSection={settingsSection}
          onSectionSelect={setSettingsSection}
          onProfileClick={() => { setContactInfoChatId(null); setShowContactInfo(true); }}
          onLogout={() => void handleLogout()}
        />
      ) : (
      <div className="vw-list">

        <header className="vw-list__header">
          <button
            type="button"
            className="vw-list__profile"
            onClick={() => { setContactInfoChatId(null); setShowContactInfo(true); }}
          >
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt={user.name} style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover" }} />
            ) : (
              <div style={{ width: 40, height: 40, borderRadius: "50%", backgroundColor: `hsl(${hue(user?.name ?? "V")},50%,45%)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ color: "white", fontWeight: 700, fontSize: 15 }}>{initials(user?.name ?? "V")}</span>
              </div>
            )}
            <span className="vw-list__profile-name">
              {mainSection === "archived" ? "Archived" : user?.name}
            </span>
          </button>
          <div className="vw-list__actions">
            <button
              type="button"
              title="New chat"
              className="vw-icon-btn"
              onClick={() => { setSidebarMenuOpen(false); setSidebarView("contacts-direct"); }}
            >
              <MessageSquarePlus size={21} strokeWidth={1.75} />
            </button>
            <button
              ref={sidebarMenuBtnRef}
              type="button"
              title="Menu"
              className="vw-icon-btn"
              onClick={() => setSidebarMenuOpen((o) => !o)}
            >
              <MoreVertical size={21} strokeWidth={1.75} />
            </button>
            <DropdownMenu
              open={sidebarMenuOpen}
              onClose={() => setSidebarMenuOpen(false)}
              anchorRef={sidebarMenuBtnRef}
              items={[
                { label: "New group", onClick: () => { setGroupSelected([]); setSidebarView("contacts-group"); } },
                { label: "Starred messages", onClick: () => void openStarred() },
                { label: "Select chats", onClick: () => alert("Select chats is coming soon on Videh Web.") },
                { label: "Mark all as read", onClick: markAllRead },
                { divider: true, label: "" },
                { label: "Log out", onClick: handleLogout, danger: true },
              ]}
            />
          </div>
        </header>

        <div className="vw-list__search-wrap">
          <div className="vw-list__search">
            <Search size={17} strokeWidth={2} color="#8696a0" />
            <input
              placeholder="Search or start new chat"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {mainSection === "chats" && (
          <WebFilterChips
            chips={[
              { id: "all", label: "All" },
              { id: "unread", label: "Unread", count: unreadChatCount },
              { id: "favorites", label: "Favourites", count: favCount },
            ]}
            activeId={chatFilter}
            onChange={(id) => setChatFilter(id as "all" | "unread" | "favorites")}
          />
        )}

        <div className="vw-list__scroll">
          {filteredChats.length === 0 && (
            <div className="vw-list__empty">
              <div className="vw-list__empty-icon">
                <MessageSquarePlus size={28} strokeWidth={1.5} />
              </div>
              <p className="vw-list__empty-title">{search ? "No results found" : "No chats yet"}</p>
              <p className="vw-list__empty-sub">
                {search ? `Nothing matched "${search}"` : "Start a conversation by tapping the new chat button above"}
              </p>
            </div>
          )}
          {filteredChats.map((chat) => {
            const chatName = getChatName(chat);
            const av = getChatAvatar(chat);
            const isActive = chat.id === activeChatId;
            const lastMsgText = chat.last_message
              ? inferListPreview(
                  chat.last_message.type,
                  chat.last_message.content,
                  chat.last_message.is_deleted,
                  chat.last_message.media_url,
                )
              : "No messages yet";
            const isFav = favoriteChatIds.includes(chat.id);

            return (
              <div
                key={chat.id}
                role="button"
                tabIndex={0}
                className={`vw-chat-row${isActive ? " vw-chat-row--active" : ""}`}
                onClick={() => setActiveChatId(chat.id)}
                onKeyDown={(e) => { if (e.key === "Enter") setActiveChatId(chat.id); }}
              >
                <Avatar name={chatName} url={av} size={49} ring={!chat.is_group && chat.other_members?.[0] ? statusRingForUser(chat.other_members[0].id) : null} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span className="vw-chat-row__name">
                      {searchLower ? highlightMatches(chatName, search) : chatName}
                      {isFav ? <span style={{ marginLeft: 4, color: "#f5b800" }}>★</span> : null}
                    </span>
                    <span className={`vw-chat-row__time${chat.unread_count > 0 ? " vw-chat-row__time--unread" : ""}`}>
                      {chat.last_message ? formatChatTime(chat.last_message.created_at) : ""}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <p className="vw-chat-row__preview">
                      {searchLower ? highlightMatches(lastMsgText, search) : lastMsgText}
                    </p>
                    {chat.unread_count > 0 ? (
                      <span className="vw-badge-count">{chat.unread_count}</span>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      )}

      {/* Right panel */}
      {activeChatId && activeChat ? (
        <div className="vw-chat">

          <header className="vw-chat__header">
            {(() => {
              const av = getChatAvatar(activeChat);
              const chatName = getChatName(activeChat);
              return av ? (
                <img src={av} alt={chatName} style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover" }} />
              ) : (
                <div style={{ width: 40, height: 40, borderRadius: "50%", backgroundColor: `hsl(${hue(chatName)},50%,45%)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ color: "white", fontWeight: 700, fontSize: 15 }}>{initials(chatName)}</span>
                </div>
              );
            })()}
            <button
              type="button"
              className="vw-chat__header-btn"
              onClick={() => { if (activeChatId) { setContactInfoChatId(activeChatId); setShowContactInfo(true); } }}
            >
              <div className="vw-chat__header-name">{getChatName(activeChat)}</div>
              <div className="vw-chat__header-status">
                {activeChat.is_group ? "Group" : activeChat.other_members?.[0]?.is_online ? "online" : ""}
              </div>
            </button>
            <div style={{ display: "flex", gap: 4, position: "relative", alignItems: "center" }}>
              <button
                type="button"
                title="Search in chat"
                className="vw-icon-btn"
                onClick={() => setChatSearchOpen((o) => !o)}
                style={{ background: chatSearchOpen ? "#e9edef" : undefined }}
              >
                <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M15.9 14.3H15l-.3-.3c1-1.1 1.6-2.7 1.6-4.3 0-3.7-3-6.7-6.7-6.7S2.9 6 2.9 9.7s3 6.7 6.7 6.7c1.6 0 3.2-.6 4.3-1.6l.3.3v.8l5.1 5.1 1.5-1.5-4.9-5.2zm-6.2 0C7.1 14.3 4 11.3 4 7.6S7 .9 9.7.9s5.7 3 5.7 5.7-2.5 7.7-5.5 7.7z"/></svg>
              </button>
              <button
                ref={chatMenuBtnRef}
                type="button"
                title="Chat menu"
                className="vw-icon-btn"
                onClick={() => setChatMenuOpen((o) => !o)}
              >
                <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 7a2 2 0 1 0-.001-4.001A2 2 0 0 0 12 7zm0 2a2 2 0 1 0-.001 3.999A2 2 0 0 0 12 9zm0 6a2 2 0 1 0-.001 3.999A2 2 0 0 0 12 15z"/></svg>
              </button>
              <DropdownMenu
                open={chatMenuOpen}
                onClose={() => setChatMenuOpen(false)}
                anchorRef={chatMenuBtnRef}
                items={[
                  { label: chatSearchOpen ? "Close search" : "Search messages", onClick: () => setChatSearchOpen((o) => !o) },
                  { label: activeChat.is_muted ? "Unmute notifications" : "Mute notifications", onClick: toggleMute },
                  {
                    label: favoriteChatIds.includes(activeChatId!) ? "Remove from favourites" : "Add to favourites",
                    onClick: () => toggleFavoriteChat(activeChatId!),
                  },
                  { label: "Contact info", onClick: () => { setContactInfoChatId(activeChatId); setShowContactInfo(true); } },
                ]}
              />
            </div>
          </header>

          {chatSearchOpen && (
            <div className="vw-chat-search-bar">
              <input
                value={chatSearchQuery}
                onChange={(e) => setChatSearchQuery(e.target.value)}
                placeholder="Search in this chat"
                autoFocus
              />
              {chatSearchLower ? (
                <div className="vw-chat-search-meta">
                  {chatSearchMatchCount > 0
                    ? `${chatSearchMatchCount} message${chatSearchMatchCount === 1 ? "" : "s"} found`
                    : "No messages found"}
                </div>
              ) : null}
            </div>
          )}

          <div className="vw-chat__messages">
            {displayMessages.length === 0 && messages.length === 0 && !chatSearchLower && (
              <div style={{ textAlign: "center", color: "#667781", marginTop: 40 }}>
                <p style={{ margin: 0, fontSize: 14 }}>No messages yet. Say hello! 👋</p>
              </div>
            )}
            {displayMessages.length === 0 && chatSearchLower && messages.length > 0 && (
              <div style={{ textAlign: "center", color: "#667781", marginTop: 40 }}>
                <p style={{ margin: 0, fontSize: 14 }}>No messages match &ldquo;{chatSearchQuery}&rdquo;</p>
              </div>
            )}
            {displayMessages.map((msg) => {
              const isMe = msg.sender_id === user?.id;
              const isDeleted = msg.is_deleted;
              const callMeta = !isDeleted && (msg.type === "call" || parseCallMessageMeta(msg.content))
                ? parseCallMessageMeta(msg.content)
                : null;
              return (
                <div key={msg.id} style={{ display: "flex", justifyContent: isMe ? "flex-end" : "flex-start", marginBottom: 4 }}>
                  <div style={{
                    maxWidth: "70%",
                    backgroundColor: isMe ? "var(--vw-bubble-sent, #d9fdd3)" : "var(--vw-bubble-received, white)",
                    borderRadius: isMe ? "8px 8px 2px 8px" : "8px 8px 8px 2px",
                    padding: "7px 12px",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
                    opacity: isDeleted ? 0.6 : 1,
                  }}>
                    {!isMe && !activeChat.is_group && msg.sender_name && (
                      <div style={{ fontSize: 12, fontWeight: 600, color: `hsl(${hue(msg.sender_name)},60%,40%)`, marginBottom: 2 }}>
                        {chatSearchLower ? highlightMatches(msg.sender_name, chatSearchQuery) : msg.sender_name}
                      </div>
                    )}
                    {!isDeleted && msg.type === "image" && msg.media_url ? (
                      <WebChatImage url={msg.media_url} token={token} />
                    ) : null}
                    {!isDeleted && msg.type === "video" && msg.media_url ? (
                      <WebChatVideo url={msg.media_url} token={token} />
                    ) : null}
                    {!isDeleted && isDocumentMessage(msg) ? (
                      <WebDocumentBubble
                        url={msg.media_url!}
                        token={token}
                        content={msg.content || "Document"}
                        highlightQuery={chatSearchLower ? chatSearchQuery : undefined}
                      />
                    ) : null}
                    {callMeta ? (
                      <WebCallMessageBubble content={msg.content} isMe={isMe} />
                    ) : (
                    <p style={{ margin: 0, fontSize: 14.5, color: "#111b21", lineHeight: 1.4, fontStyle: isDeleted ? "italic" : "normal" }}>
                      {isDeleted
                        ? "🚫 This message was deleted"
                        : (() => {
                            const raw =
                              (msg.type === "image" || msg.type === "video" || isDocumentMessage(msg)) && msg.media_url
                                ? (isDocumentMessage(msg)
                                  ? msg.content || "Document"
                                  : msg.content !== "Attachment" && msg.content !== "🎥 Video" && msg.content !== "📷 Photo"
                                    ? msg.content
                                    : "")
                                : msg.content;
                            return chatSearchLower && raw ? highlightMatches(raw, chatSearchQuery) : raw;
                          })()}
                    </p>
                    )}
                    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 4, marginTop: 3 }}>
                      <span style={{ fontSize: 11, color: "#667781" }}>{formatTime(msg.created_at)}</span>
                      {isMe && (
                        <svg viewBox="0 0 16 11" width="16" height="11" fill="#53bdeb"><path d="M11.071.653a.45.45 0 0 0-.641 0L4.5 6.582 1.571 3.653a.45.45 0 0 0-.641.642l3.25 3.25a.45.45 0 0 0 .641 0l6.25-6.25a.45.45 0 0 0 0-.642z"/><path d="M15.071.653a.45.45 0 0 0-.641 0L8.5 6.582 7.071 5.153a.45.45 0 0 0-.641.642l1.75 1.75a.45.45 0 0 0 .641 0l6.25-6.25a.45.45 0 0 0 0-.642z"/></svg>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={msgsEndRef} />
          </div>

          {/* Input bar */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*,.gif,.pdf,.doc,.docx"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              const files = e.target.files;
              if (files?.length) void handleAttachments(files);
              e.target.value = "";
            }}
          />
          <div className="vw-chat__input-bar">
            <div ref={emojiWrapRef} style={{ position: "relative" }}>
              <button
                type="button"
                title="Emoji"
                className="vw-icon-btn"
                onClick={() => setEmojiOpen((o) => !o)}
                style={{ background: emojiOpen ? "#e9edef" : undefined }}
              >
                <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M9.153 11.603c.795 0 1.439-.879 1.439-1.962s-.644-1.962-1.439-1.962-1.439.879-1.439 1.962.644 1.962 1.439 1.962zm-3.204 1.362c-.026-.307-.131 5.218 6.063 5.551 6.066-.25 6.066-5.551 6.066-5.551-6.078 1.416-12.129 0-12.129 0zm11.363 1.108s-.669 1.959-5.051 1.959c-3.505 0-5.388-1.164-5.607-1.959 0 0 5.912 1.055 10.658 0zM11.804 1.011C5.609 1.011.978 6.033.978 12.228s4.826 10.761 11.021 10.761S23.02 18.423 23.02 12.228c.001-6.195-5.021-11.217-11.216-11.217zM12 21.354c-5.273 0-9.381-4.085-9.381-9.381 0-5.295 3.942-9.424 9.215-9.424 5.273 0 9.381 4.129 9.381 9.424-.001 5.297-3.942 9.381-9.215 9.381z"/></svg>
              </button>
              {emojiOpen && (
                <EmojiPicker
                  onPick={(e) => {
                    setMsgText((t) => t + e);
                    inputRef.current?.focus();
                  }}
                />
              )}
            </div>
            <button
              type="button"
              title="Attach file"
              className="vw-icon-btn"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              style={{ opacity: uploading ? 0.5 : 1, cursor: uploading ? "wait" : "pointer" }}
            >
              <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M1.816 15.556v.002c0 1.502.584 2.912 1.646 3.972s2.472 1.647 3.974 1.647a5.58 5.58 0 0 0 3.972-1.645l9.547-9.548c.769-.768 1.147-1.767 1.058-2.817-.079-.968-.548-1.927-1.319-2.698-1.594-1.592-4.068-1.711-5.517-.262l-7.916 7.915c-.881.881-.792 2.25.214 3.261.959.958 2.423 1.053 3.263.215l5.511-5.512c.28-.28.267-.722.053-.936l-.244-.244c-.191-.191-.567-.349-.957.04l-5.506 5.506c-.18.18-.635.127-.976-.214-.098-.097-.576-.613-.213-.973l7.915-7.917c.818-.817 2.267-.699 3.23.262.5.501.802 1.1.849 1.685.051.573-.156 1.111-.589 1.543l-9.547 9.549a3.97 3.97 0 0 1-2.829 1.171 3.975 3.975 0 0 1-2.83-1.173 3.973 3.973 0 0 1-1.172-2.828c0-1.071.415-2.076 1.172-2.83l7.209-7.211c.157-.157.264-.579.028-.814L11.5 4.36a.572.572 0 0 0-.834.018L3.456 11.59a5.58 5.58 0 0 0-1.64 3.966z"/></svg>
            </button>
            <input
              ref={inputRef}
              className="vw-chat__input"
              value={msgText}
              onChange={(e) => setMsgText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder="Type a message"
            />
            <button
              type="button"
              className="vw-send-btn"
              onClick={sendMessage}
              disabled={!msgText.trim()}
            >
              <svg viewBox="0 0 24 24" width="22" height="22" fill="white"><path d="M1.101 21.757L23.8 12.028 1.101 2.3l.011 7.912 13.623 1.816-13.623 1.817-.011 7.912z"/></svg>
            </button>
          </div>
        </div>
      ) : mainSection === "status" && statusDetailUserId === user?.id && myStatuses.length > 0 && token ? (
        <WebStatusDetailPane
          token={token}
          selfName={user!.name}
          selfAvatar={user?.avatarUrl}
          statuses={myStatuses}
          onRefresh={() => void loadStatuses(token)}
          onAddStatus={() => setStatusComposeOpen(true)}
        />
      ) : mainSection === "settings" && user && token && settingsSection ? (
        <WebSettingsDetail
          section={settingsSection}
          token={token}
          user={user}
          currentToken={token}
          onLogout={() => void handleLogout()}
          onOpenSupportChat={() => alert("Search for Videh Support in New chat, or email support@videh.app")}
        />
      ) : (
        <WebEmptyPane section={mainSection} />
      )}

      {showContactInfo && user && token && (
        <WebContactInfo token={token} self={user} chatId={contactInfoChatId} onClose={() => setShowContactInfo(false)} onSaveProfile={saveProfile} onMuteToggle={contactInfoChatId ? () => toggleMute() : undefined} />
      )}
      </div>
      {statusViewerUserId != null && viewingStatuses.length > 0 && (
        <div style={{ position: "fixed", inset: 0, zIndex: 3000, backgroundColor: "#0b141a", display: "flex", flexDirection: "column" }} onClick={() => setStatusViewerUserId(null)}>
          <div style={{ padding: 16, color: "white", display: "flex", justifyContent: "space-between" }}>
            <span>{viewingStatuses[0].user_name}</span>
            <button type="button" onClick={() => setStatusViewerUserId(null)} style={{ background: "none", border: "none", color: "white", fontSize: 22, cursor: "pointer" }}>×</button>
          </div>
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={(e) => e.stopPropagation()}>
            {viewingStatuses[0].type === "image" && viewingStatuses[0].media_url ? (
              <img src={viewingStatuses[0].media_url} alt="" style={{ maxWidth: "100%", maxHeight: "80vh", borderRadius: 8 }} />
            ) : viewingStatuses[0].type === "video" && viewingStatuses[0].media_url ? (
              <video src={viewingStatuses[0].media_url} controls style={{ maxWidth: "100%", maxHeight: "80vh", borderRadius: 8 }} />
            ) : (
              <div
                style={{
                  backgroundColor: viewingStatuses[0].background_color ?? "#00A884",
                  padding: 48,
                  borderRadius: 12,
                  maxWidth: 480,
                  width: "100%",
                  minHeight: 280,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <p style={{ color: "white", fontSize: 22, textAlign: "center", margin: 0 }}>{viewingStatuses[0].content}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

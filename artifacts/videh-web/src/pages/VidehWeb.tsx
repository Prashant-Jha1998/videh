import { useEffect, useRef, useState, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import { webApi, type WebStatus, type WebUser } from "../lib/webApi";
import { DropdownMenu, EmojiPicker, useClickOutside } from "../components/web/WebOverlays";
import { WebNavRail } from "../components/web/WebNavRail";
import { WebContactPicker, type ContactPickerMode } from "../components/web/WebContactPicker";
import { WebContactInfo } from "../components/web/WebContactInfo";
import { WebChatImage, WebChatVideo } from "../components/web/WebChatMedia";
import { WebStatusPanel } from "../components/web/WebStatusPanel";
import { WebStarredPanel } from "../components/web/WebStarredPanel";
import { WebFilterChips } from "../components/web/WebFilterChips";
import { WebEmptyPane } from "../components/web/WebEmptyPane";
import { WebCallsListPane } from "../components/web/WebCallsListPane";
import { WebSettingsPane } from "../components/web/WebSettingsPane";
import { WebDocumentBubble } from "../components/web/WebDocumentBubble";
import { Avatar, initials, hue } from "../components/web/webUiShared";
import type { CallLogEntry, ChatMember } from "../lib/webApi";
import type { WebSection } from "../lib/webDesktop";
import { WEB_LIST_PANE_WIDTH } from "../lib/webDesktop";
import { inferListPreview } from "../lib/messagePreview";

const FAV_CHATS_KEY = "videh_web_favorite_chats";

const API = "";

interface ChatEntry {
  id: number;
  is_group: boolean;
  group_name?: string;
  other_members?: { id: number; name: string; avatar_url?: string; is_online: boolean; about?: string; phone?: string }[];
  last_message?: { content: string; type?: string; created_at: string; is_deleted: boolean; sender_id: number };
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
    setStatusViewerUserId(userId);
    if (!token) return;
    const items = statusFeed.filter((s) => s.user_id === userId && !s.viewed);
    for (const s of items) {
      try {
        await webApi.viewStatus(token, s.id);
      } catch {}
    }
    if (items.length > 0) loadStatuses(token);
  }, [token, statusFeed, loadStatuses]);

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
  const filteredChats = chats.filter((c) => {
    if (!getChatName(c).toLowerCase().includes(search.toLowerCase())) return false;
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
    ? statusFeed.filter((s) => s.user_id === statusViewerUserId)
    : [];
  const activeChat = chats.find((c) => c.id === activeChatId);
  const displayMessages = chatSearchQuery.trim()
    ? messages.filter((m) => !m.is_deleted && m.content.toLowerCase().includes(chatSearchQuery.toLowerCase()))
    : messages;

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
    <div style={{ display: "flex", height: "100vh", fontFamily: "Segoe UI, sans-serif", overflow: "hidden" }}>
      <WebNavRail
        active={mainSection}
        onSectionChange={handleSectionChange}
        userAvatar={user?.avatarUrl}
        userName={user?.name ?? "Videh"}
        onProfileClick={() => { setContactInfoChatId(null); setShowContactInfo(true); }}
      />
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
        <WebStatusPanel statuses={statusFeed} selfId={user!.id} selfName={user!.name} selfAvatar={user?.avatarUrl} onSelectUser={openStatusViewer} />
      ) : mainSection === "starred" ? (
        <WebStarredPanel messages={starredMessages} onClose={() => setMainSection("chats")} onOpenChat={openChatById} />
      ) : mainSection === "calls" ? (
        <WebCallsListPane calls={callLogs} onOpenChat={(id) => void openChatById(id)} />
      ) : mainSection === "settings" && user ? (
        <WebSettingsPane
          user={user}
          onProfileClick={() => { setContactInfoChatId(null); setShowContactInfo(true); }}
          onLogout={() => void handleLogout()}
        />
      ) : (
      <div style={{ width: WEB_LIST_PANE_WIDTH, display: "flex", flexDirection: "column", borderRight: "1px solid #e9edef", backgroundColor: "white", flexShrink: 0 }}>

        {/* Sidebar header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", backgroundColor: "#f0f2f5", height: 60 }}>
          <div
            role="button"
            tabIndex={0}
            onClick={() => { setContactInfoChatId(null); setShowContactInfo(true); }}
            onKeyDown={(e) => { if (e.key === "Enter") { setContactInfoChatId(null); setShowContactInfo(true); } }}
            style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", flex: 1, minWidth: 0 }}
          >
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt={user.name} style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover" }} />
            ) : (
              <div style={{ width: 40, height: 40, borderRadius: "50%", backgroundColor: `hsl(${hue(user?.name ?? "V")},50%,45%)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ color: "white", fontWeight: 700, fontSize: 15 }}>{initials(user?.name ?? "V")}</span>
              </div>
            )}
            <span style={{ fontWeight: 600, color: "#111b21", fontSize: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {mainSection === "archived" ? "Archived" : user?.name}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, color: "#54656f", position: "relative" }}>
            <button
              type="button"
              title="New chat"
              onClick={() => { setSidebarMenuOpen(false); setSidebarView("contacts-direct"); }}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 6, borderRadius: "50%", color: "#54656f" }}
            >
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M19.005 3.175H4.674C3.642 3.175 3 3.789 3 4.821V21.02l3.544-3.514h12.461c1.033 0 2.064-1.06 2.064-2.093V4.821c-.001-1.032-1.032-1.646-2.064-1.646zm-4.989 9.869H7.041V11.1h6.975v1.944zm3-4H7.041V7.1h9.975v1.944z"/></svg>
            </button>
            <button
              ref={sidebarMenuBtnRef}
              type="button"
              title="Menu"
              onClick={() => setSidebarMenuOpen((o) => !o)}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 6, borderRadius: "50%", color: "#54656f" }}
            >
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 7a2 2 0 1 0-.001-4.001A2 2 0 0 0 12 7zm0 2a2 2 0 1 0-.001 3.999A2 2 0 0 0 12 9zm0 6a2 2 0 1 0-.001 3.999A2 2 0 0 0 12 15z"/></svg>
            </button>
            <DropdownMenu
              open={sidebarMenuOpen}
              onClose={() => setSidebarMenuOpen(false)}
              anchorRef={sidebarMenuBtnRef}
              items={[
                { label: "New group", onClick: () => { setGroupSelected([]); setSidebarView("contacts-group"); } },
                { label: "Starred messages", onClick: () => void openStarred() },
                { label: "Mark all as read", onClick: markAllRead },
                { label: "Log out", onClick: handleLogout, danger: true },
              ]}
            />
          </div>
        </div>

        {/* Search */}
        <div style={{ padding: "8px 12px", backgroundColor: "white" }}>
          <div style={{ display: "flex", alignItems: "center", backgroundColor: "#f0f2f5", borderRadius: 8, padding: "8px 12px", gap: 8 }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="#54656f"><path d="M15.009 13.805h-.636l-.22-.219a5.184 5.184 0 0 0 1.256-3.386 5.207 5.207 0 1 0-5.207 5.208 5.183 5.183 0 0 0 3.385-1.255l.221.22v.635l4.004 3.999 1.194-1.195-3.997-4.007zm-4.808 0a3.605 3.605 0 1 1 0-7.21 3.605 3.605 0 0 1 0 7.21z"/></svg>
            <input
              placeholder="Search or start new chat"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ border: "none", background: "none", outline: "none", flex: 1, fontSize: 14, color: "#111b21" }}
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

        {/* Chat list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {filteredChats.length === 0 && (
            <div style={{ padding: 40, textAlign: "center", color: "#667781" }}>
              <p style={{ margin: 0 }}>{search ? `No results for "${search}"` : "No chats yet"}</p>
            </div>
          )}
          {filteredChats.map((chat) => {
            const chatName = getChatName(chat);
            const av = getChatAvatar(chat);
            const isActive = chat.id === activeChatId;
            const lastMsgText = chat.last_message
              ? inferListPreview(chat.last_message.type, chat.last_message.content, chat.last_message.is_deleted)
              : "No messages yet";
            const isFav = favoriteChatIds.includes(chat.id);

            return (
              <div
                key={chat.id}
                onClick={() => setActiveChatId(chat.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "12px 16px",
                  gap: 12,
                  cursor: "pointer",
                  backgroundColor: isActive ? "#f0f2f5" : "white",
                  borderBottom: "1px solid #f0f2f5",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLDivElement).style.backgroundColor = "#f5f6f6"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.backgroundColor = isActive ? "#f0f2f5" : "white"; }}
              >
                <Avatar name={chatName} url={av} size={49} ring={!chat.is_group && chat.other_members?.[0] ? statusRingForUser(chat.other_members[0].id) : null} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ fontWeight: 600, color: "#111b21", fontSize: 16 }}>
                      {chatName}
                      {isFav ? <span style={{ marginLeft: 4, color: "#8696a0" }}>★</span> : null}
                    </span>
                    <span style={{ fontSize: 12, color: chat.unread_count > 0 ? "#00a884" : "#667781", flexShrink: 0, marginLeft: 8 }}>
                      {chat.last_message ? formatChatTime(chat.last_message.created_at) : ""}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <p style={{ margin: 0, color: "#667781", fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                      {lastMsgText}
                    </p>
                    {chat.unread_count > 0 && (
                      <span style={{ marginLeft: 8, backgroundColor: "#00a884", color: "white", borderRadius: 10, padding: "2px 6px", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                        {chat.unread_count}
                      </span>
                    )}
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
        <div style={{ flex: 1, display: "flex", flexDirection: "column", backgroundColor: "#efeae2", backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23c8c8c8' fill-opacity='0.15'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }}>

          {/* Chat header */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", backgroundColor: "#f0f2f5", height: 60, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
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
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, color: "#111b21", fontSize: 16 }}>{getChatName(activeChat)}</div>
              <div style={{ fontSize: 13, color: "#667781" }}>
                {activeChat.is_group ? "Group" : activeChat.other_members?.[0]?.is_online ? "online" : ""}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, color: "#54656f", position: "relative", alignItems: "center" }}>
              <button
                type="button"
                title="Search in chat"
                onClick={() => setChatSearchOpen((o) => !o)}
                style={{ background: chatSearchOpen ? "#e9edef" : "none", border: "none", cursor: "pointer", padding: 6, borderRadius: "50%", color: "#54656f" }}
              >
                <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M15.9 14.3H15l-.3-.3c1-1.1 1.6-2.7 1.6-4.3 0-3.7-3-6.7-6.7-6.7S2.9 6 2.9 9.7s3 6.7 6.7 6.7c1.6 0 3.2-.6 4.3-1.6l.3.3v.8l5.1 5.1 1.5-1.5-4.9-5.2zm-6.2 0C7.1 14.3 4 11.3 4 7.6S7 .9 9.7.9s5.7 3 5.7 5.7-2.5 7.7-5.5 7.7z"/></svg>
              </button>
              <button
                ref={chatMenuBtnRef}
                type="button"
                title="Chat menu"
                onClick={() => setChatMenuOpen((o) => !o)}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 6, borderRadius: "50%", color: "#54656f" }}
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
          </div>

          {chatSearchOpen && (
            <div style={{ padding: "8px 16px", backgroundColor: "#f0f2f5", borderBottom: "1px solid #e9edef" }}>
              <input
                value={chatSearchQuery}
                onChange={(e) => setChatSearchQuery(e.target.value)}
                placeholder="Search in this chat"
                autoFocus
                style={{ width: "100%", padding: "8px 12px", border: "none", borderRadius: 8, fontSize: 14, outline: "none" }}
              />
            </div>
          )}

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 8% 8px" }}>
            {displayMessages.length === 0 && messages.length === 0 && (
              <div style={{ textAlign: "center", color: "#667781", marginTop: 40 }}>
                <p style={{ margin: 0, fontSize: 14 }}>No messages yet. Say hello! 👋</p>
              </div>
            )}
            {displayMessages.map((msg) => {
              const isMe = msg.sender_id === user?.id;
              const isDeleted = msg.is_deleted;
              return (
                <div key={msg.id} style={{ display: "flex", justifyContent: isMe ? "flex-end" : "flex-start", marginBottom: 4 }}>
                  <div style={{
                    maxWidth: "70%",
                    backgroundColor: isMe ? "#d9fdd3" : "white",
                    borderRadius: isMe ? "8px 8px 2px 8px" : "8px 8px 8px 2px",
                    padding: "7px 12px",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
                    opacity: isDeleted ? 0.6 : 1,
                  }}>
                    {!isMe && !activeChat.is_group && msg.sender_name && (
                      <div style={{ fontSize: 12, fontWeight: 600, color: `hsl(${hue(msg.sender_name)},60%,40%)`, marginBottom: 2 }}>{msg.sender_name}</div>
                    )}
                    {!isDeleted && msg.type === "image" && msg.media_url ? (
                      <WebChatImage url={msg.media_url} token={token} />
                    ) : null}
                    {!isDeleted && msg.type === "video" && msg.media_url ? (
                      <WebChatVideo url={msg.media_url} token={token} />
                    ) : null}
                    {!isDeleted && msg.type === "document" && msg.media_url ? (
                      <WebDocumentBubble url={msg.media_url} token={token} filename={msg.content || "Document"} />
                    ) : null}
                    <p style={{ margin: 0, fontSize: 14.5, color: "#111b21", lineHeight: 1.4, fontStyle: isDeleted ? "italic" : "normal" }}>
                      {isDeleted
                        ? "🚫 This message was deleted"
                        : ((msg.type === "image" || msg.type === "video" || msg.type === "document") && msg.media_url
                          ? (msg.type === "document" ? "" : msg.content !== "Attachment" && msg.content !== "🎥 Video" && msg.content !== "📷 Photo" ? msg.content : "")
                          : msg.content)}
                    </p>
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
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", backgroundColor: "#f0f2f5", position: "relative" }}>
            <div ref={emojiWrapRef} style={{ position: "relative" }}>
              <button
                type="button"
                title="Emoji"
                onClick={() => setEmojiOpen((o) => !o)}
                style={{ background: emojiOpen ? "#e9edef" : "none", border: "none", cursor: "pointer", color: "#54656f", padding: 6 }}
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
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              style={{ background: "none", border: "none", cursor: uploading ? "wait" : "pointer", color: "#54656f", padding: 6, opacity: uploading ? 0.5 : 1 }}
            >
              <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M1.816 15.556v.002c0 1.502.584 2.912 1.646 3.972s2.472 1.647 3.974 1.647a5.58 5.58 0 0 0 3.972-1.645l9.547-9.548c.769-.768 1.147-1.767 1.058-2.817-.079-.968-.548-1.927-1.319-2.698-1.594-1.592-4.068-1.711-5.517-.262l-7.916 7.915c-.881.881-.792 2.25.214 3.261.959.958 2.423 1.053 3.263.215l5.511-5.512c.28-.28.267-.722.053-.936l-.244-.244c-.191-.191-.567-.349-.957.04l-5.506 5.506c-.18.18-.635.127-.976-.214-.098-.097-.576-.613-.213-.973l7.915-7.917c.818-.817 2.267-.699 3.23.262.5.501.802 1.1.849 1.685.051.573-.156 1.111-.589 1.543l-9.547 9.549a3.97 3.97 0 0 1-2.829 1.171 3.975 3.975 0 0 1-2.83-1.173 3.973 3.973 0 0 1-1.172-2.828c0-1.071.415-2.076 1.172-2.83l7.209-7.211c.157-.157.264-.579.028-.814L11.5 4.36a.572.572 0 0 0-.834.018L3.456 11.59a5.58 5.58 0 0 0-1.64 3.966z"/></svg>
            </button>
            <input
              ref={inputRef}
              value={msgText}
              onChange={(e) => setMsgText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder="Type a message"
              style={{ flex: 1, padding: "10px 16px", border: "none", borderRadius: 8, backgroundColor: "white", fontSize: 15, outline: "none", color: "#111b21" }}
            />
            <button
              onClick={sendMessage}
              disabled={!msgText.trim()}
              style={{ width: 44, height: 44, borderRadius: "50%", backgroundColor: "#00a884", border: "none", cursor: msgText.trim() ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", opacity: msgText.trim() ? 1 : 0.5, transition: "opacity 0.2s" }}
            >
              <svg viewBox="0 0 24 24" width="22" height="22" fill="white"><path d="M1.101 21.757L23.8 12.028 1.101 2.3l.011 7.912 13.623 1.816-13.623 1.817-.011 7.912z"/></svg>
            </button>
          </div>
        </div>
      ) : (
        <WebEmptyPane section={mainSection} />
      )}

      {showContactInfo && user && token && (
        <WebContactInfo token={token} self={user} chatId={contactInfoChatId} onClose={() => setShowContactInfo(false)} onSaveProfile={saveProfile} onMuteToggle={contactInfoChatId ? () => toggleMute() : undefined} />
      )}
      {statusViewerUserId != null && viewingStatuses.length > 0 && (
        <div style={{ position: "fixed", inset: 0, zIndex: 3000, backgroundColor: "#0b141a", display: "flex", flexDirection: "column" }} onClick={() => setStatusViewerUserId(null)}>
          <div style={{ padding: 16, color: "white", display: "flex", justifyContent: "space-between" }}>
            <span>{viewingStatuses[0].user_name}</span>
            <button type="button" onClick={() => setStatusViewerUserId(null)} style={{ background: "none", border: "none", color: "white", fontSize: 22, cursor: "pointer" }}>×</button>
          </div>
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={(e) => e.stopPropagation()}>
            {viewingStatuses[0].type === "image" && viewingStatuses[0].media_url ? (
              <img src={viewingStatuses[0].media_url} alt="" style={{ maxWidth: "100%", maxHeight: "80vh", borderRadius: 8 }} />
            ) : (
              <p style={{ color: "white", fontSize: 22, textAlign: "center" }}>{viewingStatuses[0].content}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

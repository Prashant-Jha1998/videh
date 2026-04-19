import { useEffect, useRef, useState, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";

const API = "";

interface WebUser {
  id: number;
  name: string;
  phone: string;
  about: string;
  avatarUrl?: string;
}

interface ChatEntry {
  id: number;
  is_group: boolean;
  group_name?: string;
  other_members?: { id: number; name: string; avatar_url?: string; is_online: boolean }[];
  last_message?: { content: string; created_at: string; is_deleted: boolean; sender_id: number };
  unread_count: number;
  is_pinned?: boolean;
  is_muted?: boolean;
}

interface Msg {
  id: number;
  chat_id: number;
  sender_id: number;
  content: string;
  type: string;
  is_deleted: boolean;
  created_at: string;
  sender_name?: string;
}

type SessionStatus = "loading" | "pending" | "scanning" | "linked" | "expired" | "error";

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
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const msgsEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  // Poll session status
  const pollStatus = useCallback(async (tok: string) => {
    try {
      const res = await fetch(getApiUrl(`/web-session/${tok}/status`));
      const data = await res.json();
      if (!data.success) return;
      if (data.status === "expired") { setStatus("expired"); stopPoll(); return; }
      if (data.status === "linked" && data.user) {
        setUser(data.user);
        setStatus("linked");
        stopPoll();
        loadChats(tok);
      }
    } catch {}
  }, []);

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
    try {
      await fetch(getApiUrl(`/web-session/${token}/messages`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: String(activeChatId), content: text }),
      });
      await loadMessages(activeChatId);
      if (token) loadChats(token);
    } catch {}
  }, [token, activeChatId, msgText, loadMessages, loadChats]);

  useEffect(() => {
    createSession().then((tok) => {
      if (tok) {
        pollRef.current = setInterval(() => pollStatus(tok), 2000);
      }
    });
    return () => stopPoll();
  }, []);

  useEffect(() => {
    if (activeChatId) loadMessages(activeChatId);
  }, [activeChatId]);

  useEffect(() => {
    msgsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Refresh messages periodically when chat is open
  useEffect(() => {
    if (!activeChatId || !token) return;
    const t = setInterval(() => loadMessages(activeChatId), 5000);
    return () => clearInterval(t);
  }, [activeChatId, token]);

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
  const initials = (name: string) => name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  const hue = (name: string) => name.charCodeAt(0) * 37 % 360;

  const filteredChats = chats.filter((c) => getChatName(c).toLowerCase().includes(search.toLowerCase()));
  const activeChat = chats.find((c) => c.id === activeChatId);

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

      {/* Sidebar */}
      <div style={{ width: 380, display: "flex", flexDirection: "column", borderRight: "1px solid #e9edef", backgroundColor: "white", flexShrink: 0 }}>

        {/* Sidebar header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", backgroundColor: "#f0f2f5", height: 60 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt={user.name} style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover" }} />
            ) : (
              <div style={{ width: 40, height: 40, borderRadius: "50%", backgroundColor: `hsl(${hue(user?.name ?? "V")},50%,45%)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ color: "white", fontWeight: 700, fontSize: 15 }}>{initials(user?.name ?? "V")}</span>
              </div>
            )}
            <span style={{ fontWeight: 600, color: "#111b21", fontSize: 16 }}>{user?.name}</span>
          </div>
          <div style={{ display: "flex", gap: 8, color: "#54656f" }}>
            <button title="New chat" style={{ background: "none", border: "none", cursor: "pointer", padding: 6, borderRadius: "50%", color: "#54656f" }}>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M19.005 3.175H4.674C3.642 3.175 3 3.789 3 4.821V21.02l3.544-3.514h12.461c1.033 0 2.064-1.06 2.064-2.093V4.821c-.001-1.032-1.032-1.646-2.064-1.646zm-4.989 9.869H7.041V11.1h6.975v1.944zm3-4H7.041V7.1h9.975v1.944z"/></svg>
            </button>
            <button title="Videh Web" style={{ background: "none", border: "none", cursor: "pointer", padding: 6, borderRadius: "50%", color: "#54656f" }}>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 7a2 2 0 1 0-.001-4.001A2 2 0 0 0 12 7zm0 2a2 2 0 1 0-.001 3.999A2 2 0 0 0 12 9zm0 6a2 2 0 1 0-.001 3.999A2 2 0 0 0 12 15z"/></svg>
            </button>
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
              ? chat.last_message.is_deleted
                ? "This message was deleted"
                : chat.last_message.content
              : "No messages yet";

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
                {av ? (
                  <img src={av} alt={chatName} style={{ width: 49, height: 49, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 49, height: 49, borderRadius: "50%", backgroundColor: `hsl(${hue(chatName)},50%,45%)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ color: "white", fontWeight: 700, fontSize: 18 }}>{initials(chatName)}</span>
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ fontWeight: 600, color: "#111b21", fontSize: 16 }}>{chatName}</span>
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
            <div style={{ display: "flex", gap: 8, color: "#54656f" }}>
              <button style={{ background: "none", border: "none", cursor: "pointer", padding: 6, borderRadius: "50%", color: "#54656f" }}>
                <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M15.9 14.3H15l-.3-.3c1-1.1 1.6-2.7 1.6-4.3 0-3.7-3-6.7-6.7-6.7S2.9 6 2.9 9.7s3 6.7 6.7 6.7c1.6 0 3.2-.6 4.3-1.6l.3.3v.8l5.1 5.1 1.5-1.5-4.9-5.2zm-6.2 0C7.1 14.3 4 11.3 4 7.6S7 .9 9.7.9s5.7 3 5.7 5.7-2.5 7.7-5.5 7.7z"/></svg>
              </button>
              <button style={{ background: "none", border: "none", cursor: "pointer", padding: 6, borderRadius: "50%", color: "#54656f" }}>
                <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 7a2 2 0 1 0-.001-4.001A2 2 0 0 0 12 7zm0 2a2 2 0 1 0-.001 3.999A2 2 0 0 0 12 9zm0 6a2 2 0 1 0-.001 3.999A2 2 0 0 0 12 15z"/></svg>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 8% 8px" }}>
            {messages.length === 0 && (
              <div style={{ textAlign: "center", color: "#667781", marginTop: 40 }}>
                <p style={{ margin: 0, fontSize: 14 }}>No messages yet. Say hello! 👋</p>
              </div>
            )}
            {messages.map((msg) => {
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
                    <p style={{ margin: 0, fontSize: 14.5, color: "#111b21", lineHeight: 1.4, fontStyle: isDeleted ? "italic" : "normal" }}>
                      {isDeleted ? "🚫 This message was deleted" : msg.content}
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
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", backgroundColor: "#f0f2f5" }}>
            <button style={{ background: "none", border: "none", cursor: "pointer", color: "#54656f", padding: 6 }}>
              <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M9.153 11.603c.795 0 1.439-.879 1.439-1.962s-.644-1.962-1.439-1.962-1.439.879-1.439 1.962.644 1.962 1.439 1.962zm-3.204 1.362c-.026-.307-.131 5.218 6.063 5.551 6.066-.25 6.066-5.551 6.066-5.551-6.078 1.416-12.129 0-12.129 0zm11.363 1.108s-.669 1.959-5.051 1.959c-3.505 0-5.388-1.164-5.607-1.959 0 0 5.912 1.055 10.658 0zM11.804 1.011C5.609 1.011.978 6.033.978 12.228s4.826 10.761 11.021 10.761S23.02 18.423 23.02 12.228c.001-6.195-5.021-11.217-11.216-11.217zM12 21.354c-5.273 0-9.381-4.085-9.381-9.381 0-5.295 3.942-9.424 9.215-9.424 5.273 0 9.381 4.129 9.381 9.424-.001 5.297-3.942 9.381-9.215 9.381z"/></svg>
            </button>
            <button style={{ background: "none", border: "none", cursor: "pointer", color: "#54656f", padding: 6 }}>
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
        /* Empty state */
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", backgroundColor: "#f0f2f5", gap: 20 }}>
          <div style={{ width: 220, height: 220, backgroundColor: "#e9edef", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg viewBox="0 0 303 172" width="180" fill="#bfc6cb"><path d="M229.565 160.229c32.647-10.984 57.366-41.988 57.366-79.8C286.931 34.963 249.286 0 203.445 0c-34.47 0-64.395 20.467-79.441 50.353A101.733 101.733 0 0 0 100.606 44C45.086 44 0 86.91 0 139.752c0 16.037 4.166 31.13 11.42 44.228H229.565v-23.751z"/></svg>
          </div>
          <div style={{ textAlign: "center" }}>
            <h2 style={{ margin: "0 0 8px", fontSize: 24, fontWeight: 300, color: "#41525d" }}>Videh Web</h2>
            <p style={{ margin: 0, color: "#667781", fontSize: 14 }}>
              Select a chat to start messaging
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#667781", fontSize: 13 }}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="#667781"><path d="M2.213 10.35a9.681 9.681 0 0 1 9.55-8.35 9.863 9.863 0 0 1 9.861 9.861 9.863 9.863 0 0 1-9.861 9.862 9.681 9.681 0 0 1-8.35-4.769L2.1 22.8l5.937-1.313A9.9 9.9 0 0 0 11.763 22.4a10.863 10.863 0 1 0 0-21.725A10.682 10.682 0 0 0 1.1 9.875L2.213 10.35z"/></svg>
            End-to-end encrypted
          </div>
        </div>
      )}
    </div>
  );
}

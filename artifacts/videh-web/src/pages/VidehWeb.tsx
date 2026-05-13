import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { eventsUrl, type ChatDetails, type ChatEntry, type Message, type SessionStatus, type WebUser, webApi } from "@/lib/webApi";

const EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "🎉"];

function formatTime(iso?: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatChatTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 86_400_000) return formatTime(iso);
  if (diff < 172_800_000) return "Yesterday";
  return d.toLocaleDateString();
}

function initials(name?: string): string {
  return (name || "V").split(" ").map((part) => part[0]).join("").toUpperCase().slice(0, 2);
}

function hue(name?: string): number {
  return (name || "V").charCodeAt(0) * 37 % 360;
}

function chatName(chat?: ChatEntry): string {
  if (!chat) return "Videh";
  return chat.is_group ? (chat.group_name || "Group") : (chat.other_members?.[0]?.name || "Unknown");
}

function chatAvatar(chat?: ChatEntry): string | undefined {
  if (!chat) return undefined;
  return chat.is_group ? chat.group_avatar_url : chat.other_members?.[0]?.avatar_url;
}

function messagePreview(chat: ChatEntry): string {
  const msg = chat.last_message;
  if (!msg) return "No messages yet";
  if (msg.is_deleted) return "This message was deleted";
  if (msg.media_url) {
    if (msg.type === "image") return "Photo";
    if (msg.type === "video") return "Video";
    if (msg.type === "audio") return "Audio";
    return "Document";
  }
  return msg.content;
}

function mediaTypeFromFile(file: File): string {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return "document";
}

function Avatar({ name, src, size = 40 }: { name?: string; src?: string; size?: number }) {
  if (src) {
    return <img className="vw-avatar" src={src} alt={name || "Avatar"} style={{ width: size, height: size }} />;
  }
  return (
    <div className="vw-avatar vw-avatar-fallback" style={{ width: size, height: size, backgroundColor: `hsl(${hue(name)},50%,45%)` }}>
      {initials(name)}
    </div>
  );
}

function Tick({ status }: { status?: Message["delivery_status"] }) {
  if (status === "read") return <span className="vw-tick read">✓✓</span>;
  if (status === "delivered") return <span className="vw-tick">✓✓</span>;
  return <span className="vw-tick">✓</span>;
}

function MediaPreview({ msg }: { msg: Message }) {
  if (!msg.media_url || msg.is_deleted) return null;
  if (msg.type === "image") return <img className="vw-media" src={msg.media_url} alt={msg.content || "Image"} />;
  if (msg.type === "video") return <video className="vw-media" src={msg.media_url} controls />;
  if (msg.type === "audio") return <audio className="vw-audio" src={msg.media_url} controls />;
  return (
    <a className="vw-doc" href={msg.media_url} target="_blank" rel="noreferrer">
      <span>📄</span>
      <span>{msg.content || "Open document"}</span>
    </a>
  );
}

export default function VidehWeb() {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [token, setToken] = useState<string | null>(null);
  const [qrData, setQrData] = useState("");
  const [user, setUser] = useState<WebUser | null>(null);
  const [chats, setChats] = useState<ChatEntry[]>([]);
  const [activeChatId, setActiveChatId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgText, setMsgText] = useState("");
  const [chatSearch, setChatSearch] = useState("");
  const [messageSearch, setMessageSearch] = useState("");
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [details, setDetails] = useState<ChatDetails | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const msgsEndRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const activeChat = useMemo(() => chats.find((chat) => chat.id === activeChatId), [chats, activeChatId]);

  const filteredChats = useMemo(() => {
    const q = chatSearch.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter((chat) => chatName(chat).toLowerCase().includes(q) || messagePreview(chat).toLowerCase().includes(q));
  }, [chats, chatSearch]);

  const visibleMessages = useMemo(() => {
    const q = messageSearch.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter((msg) => msg.content.toLowerCase().includes(q) || msg.sender_name?.toLowerCase().includes(q));
  }, [messages, messageSearch]);

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const createSession = useCallback(async () => {
    try {
      setError(null);
      const data = await webApi.createSession();
      setToken(data.token);
      setQrData(`videh://scan?token=${data.token}&host=${encodeURIComponent(window.location.origin)}`);
      setStatus("pending");
      return data.token;
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Could not create web session.");
      return null;
    }
  }, []);

  const loadChats = useCallback(async (tok = token) => {
    if (!tok) return;
    const data = await webApi.chats(tok);
    setChats(data.chats || []);
  }, [token]);

  const loadMessages = useCallback(async (chatId = activeChatId, tok = token) => {
    if (!tok || !chatId) return;
    const data = await webApi.messages(tok, chatId);
    setMessages(data.messages || []);
  }, [activeChatId, token]);

  const loadTyping = useCallback(async (chatId = activeChatId, tok = token) => {
    if (!tok || !chatId) return;
    const data = await webApi.getTyping(tok, chatId);
    setTypingNames((data.typing || []).map((member) => member.name).filter(Boolean));
  }, [activeChatId, token]);

  const loadDetails = useCallback(async (chatId = activeChatId, tok = token) => {
    if (!tok || !chatId) return;
    const data = await webApi.details(tok, chatId);
    setDetails({ chat: data.chat, members: data.members || [] });
  }, [activeChatId, token]);

  const pollStatus = useCallback(async (tok: string) => {
    try {
      const data = await webApi.sessionStatus(tok);
      if (data.status === "expired") {
        setStatus("expired");
        stopPoll();
        localStorage.removeItem("videh_web_token");
        return;
      }
      if (data.status === "linked" && data.user) {
        setToken(tok);
        setUser(data.user);
        setStatus("linked");
        stopPoll();
        localStorage.setItem("videh_web_token", tok);
        await loadChats(tok);
      }
    } catch {
      localStorage.removeItem("videh_web_token");
    }
  }, [loadChats, stopPoll]);

  useEffect(() => {
    const startNewSession = () => {
      createSession().then((tok) => {
        if (tok) pollRef.current = setInterval(() => pollStatus(tok), 2000);
      });
    };
    const savedToken = localStorage.getItem("videh_web_token");
    if (savedToken) {
      webApi.sessionStatus(savedToken)
        .then((data) => {
          if (data.status === "linked" && data.user) {
            setToken(savedToken);
            setUser(data.user);
            setStatus("linked");
            loadChats(savedToken);
          } else {
            localStorage.removeItem("videh_web_token");
            startNewSession();
          }
        })
        .catch(() => {
          localStorage.removeItem("videh_web_token");
          startNewSession();
        });
    } else {
      startNewSession();
    }
    return () => stopPoll();
  }, [createSession, loadChats, pollStatus, stopPoll]);

  useEffect(() => {
    if (!token || status !== "linked") return;
    const source = new EventSource(eventsUrl(token));
    const refresh = () => {
      loadChats().catch(() => {});
      if (activeChatId) {
        loadMessages(activeChatId).catch(() => {});
        loadTyping(activeChatId).catch(() => {});
      }
    };
    source.addEventListener("message", refresh);
    source.addEventListener("read", refresh);
    source.addEventListener("archive", refresh);
    source.addEventListener("typing", refresh);
    source.onerror = () => {
      source.close();
    };
    return () => source.close();
  }, [activeChatId, loadChats, loadMessages, loadTyping, status, token]);

  useEffect(() => {
    if (!activeChatId || !token) return;
    loadMessages(activeChatId);
    webApi.markRead(token, activeChatId).then(() => loadChats()).catch(() => {});
    loadTyping(activeChatId);
    if (infoOpen) loadDetails(activeChatId);
  }, [activeChatId, infoOpen, loadChats, loadDetails, loadMessages, loadTyping, token]);

  useEffect(() => {
    msgsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (status !== "linked" || !token) return;
    const fallback = setInterval(() => {
      loadChats().catch(() => {});
      if (activeChatId) {
        loadMessages(activeChatId).catch(() => {});
        loadTyping(activeChatId).catch(() => {});
      }
    }, 12_000);
    return () => clearInterval(fallback);
  }, [activeChatId, loadChats, loadMessages, loadTyping, status, token]);

  const sendMessage = useCallback(async () => {
    if (!token || !activeChatId || !msgText.trim()) return;
    const text = msgText.trim();
    setMsgText("");
    setEmojiOpen(false);
    try {
      await webApi.sendMessage(token, activeChatId, { content: text, type: "text" });
      await Promise.all([loadMessages(activeChatId), loadChats()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send message.");
      setMsgText(text);
    }
  }, [activeChatId, loadChats, loadMessages, msgText, token]);

  const handleTextChange = (value: string) => {
    setMsgText(value);
    if (!token || !activeChatId) return;
    webApi.setTyping(token, activeChatId, true).catch(() => {});
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      webApi.setTyping(token, activeChatId, false).catch(() => {});
    }, 1600);
  };

  const handleUpload = async (file?: File) => {
    if (!file || !token || !activeChatId) return;
    setUploading(true);
    try {
      const uploaded = await webApi.uploadMedia(token, file);
      await webApi.sendMessage(token, activeChatId, {
        content: file.name,
        type: mediaTypeFromFile(file),
        mediaUrl: uploaded.url,
      });
      await Promise.all([loadMessages(activeChatId), loadChats()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload media.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const react = async (messageId: number, emoji: string) => {
    if (!token || !activeChatId) return;
    await webApi.reactMessage(token, activeChatId, messageId, emoji);
    await loadMessages(activeChatId);
  };

  const star = async (messageId: number) => {
    if (!token || !activeChatId) return;
    await webApi.starMessage(token, activeChatId, messageId);
    await loadMessages(activeChatId);
  };

  const remove = async (messageId: number) => {
    if (!token || !activeChatId) return;
    await webApi.deleteMessage(token, activeChatId, messageId);
    await Promise.all([loadMessages(activeChatId), loadChats()]);
  };

  const logout = async () => {
    if (token) await webApi.logout(token).catch(() => {});
    localStorage.removeItem("videh_web_token");
    window.location.reload();
  };

  if (status !== "linked") {
    return (
      <div className="vw-landing">
        <div className="vw-topbar">
          <img src={`${import.meta.env.BASE_URL}videh-logo.png`} alt="Videh" />
          <span>Videh Web</span>
        </div>
        <main className="vw-qr-card">
          <section>
            <h1>Use Videh on your computer</h1>
            <ol>
              <li>Open Videh on your phone</li>
              <li>Go to Settings → Linked Devices → Link a Device</li>
              <li>Scan this QR code from your phone</li>
            </ol>
            <p className="vw-tip">Keep your phone and browser connected while the session is linking.</p>
          </section>
          <section className="vw-qr-box">
            {status === "loading" && <div className="vw-spinner" />}
            {(status === "pending" || status === "scanning") && qrData && <QRCodeSVG value={qrData} size={230} level="M" />}
            {status === "expired" && <p>QR code expired.</p>}
            {status === "error" && <p>{error || "Connection error. Please reload."}</p>}
            <button onClick={() => { stopPoll(); setStatus("loading"); createSession().then((tok) => { if (tok) pollRef.current = setInterval(() => pollStatus(tok), 2000); }); }}>
              Refresh QR code
            </button>
          </section>
        </main>
        <WebStyles />
      </div>
    );
  }

  return (
    <div className="vw-shell">
      <aside className="vw-sidebar">
        <header className="vw-sidebar-header">
          <div className="vw-user">
            <Avatar name={user?.name} src={user?.avatarUrl} />
            <strong>{user?.name || "Videh"}</strong>
          </div>
          <button className="vw-icon-btn" onClick={logout} title="Log out this device">Log out</button>
        </header>
        <div className="vw-search">
          <input value={chatSearch} onChange={(e) => setChatSearch(e.target.value)} placeholder="Search or start new chat" />
        </div>
        <div className="vw-chat-list">
          {filteredChats.length === 0 && <p className="vw-empty">{chatSearch ? "No chats found" : "No chats yet"}</p>}
          {filteredChats.map((chat) => {
            const name = chatName(chat);
            const active = chat.id === activeChatId;
            return (
              <button key={chat.id} className={`vw-chat-row ${active ? "active" : ""}`} onClick={() => { setActiveChatId(chat.id); setInfoOpen(false); setDetails(null); }}>
                <Avatar name={name} src={chatAvatar(chat)} size={49} />
                <span className="vw-chat-main">
                  <span className="vw-chat-title">
                    <strong>{name}</strong>
                    <small>{formatChatTime(chat.last_message?.created_at)}</small>
                  </span>
                  <span className="vw-chat-preview">
                    <span>{messagePreview(chat)}</span>
                    {chat.unread_count > 0 && <b>{chat.unread_count}</b>}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      {activeChat ? (
        <main className="vw-chat">
          <header className="vw-chat-header">
            <button className="vw-header-person" onClick={() => { setInfoOpen(true); loadDetails(activeChat.id); }}>
              <Avatar name={chatName(activeChat)} src={chatAvatar(activeChat)} />
              <span>
                <strong>{chatName(activeChat)}</strong>
                <small>{typingNames.length > 0 ? `${typingNames.join(", ")} typing...` : activeChat.is_group ? `${details?.members.length || activeChat.other_members?.length || 0} members` : activeChat.other_members?.[0]?.is_online ? "online" : ""}</small>
              </span>
            </button>
            <div className="vw-header-actions">
              <input value={messageSearch} onChange={(e) => setMessageSearch(e.target.value)} placeholder="Search in chat" />
              <button className="vw-icon-btn" onClick={() => { setInfoOpen(!infoOpen); if (!infoOpen) loadDetails(activeChat.id); }}>Info</button>
            </div>
          </header>

          {error && <div className="vw-error" onClick={() => setError(null)}>{error}</div>}

          <section className="vw-messages">
            {visibleMessages.length === 0 && <p className="vw-empty">{messageSearch ? "No matching messages" : "No messages yet. Say hello!"}</p>}
            {visibleMessages.map((msg) => {
              const mine = msg.sender_id === user?.id;
              const reactions = msg.reactions || [];
              return (
                <div key={msg.id} className={`vw-bubble-row ${mine ? "mine" : ""}`}>
                  <div className={`vw-bubble ${mine ? "mine" : ""} ${msg.is_deleted ? "deleted" : ""}`}>
                    {!mine && activeChat.is_group && <strong className="vw-sender">{msg.sender_name}</strong>}
                    <MediaPreview msg={msg} />
                    <p>{msg.is_deleted ? "This message was deleted" : msg.content}</p>
                    {reactions.length > 0 && (
                      <div className="vw-reactions">{reactions.map((reaction) => <span key={`${reaction.user_id}-${reaction.emoji}`}>{reaction.emoji}</span>)}</div>
                    )}
                    <div className="vw-meta">
                      {msg.is_starred && <span>★</span>}
                      <span>{formatTime(msg.created_at)}</span>
                      {mine && <Tick status={msg.delivery_status} />}
                    </div>
                    {!msg.is_deleted && (
                      <div className="vw-message-actions">
                        {EMOJIS.slice(0, 4).map((emoji) => <button key={emoji} onClick={() => react(msg.id, emoji)}>{emoji}</button>)}
                        <button onClick={() => star(msg.id)}>{msg.is_starred ? "Unstar" : "Star"}</button>
                        {mine && <button onClick={() => remove(msg.id)}>Delete</button>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={msgsEndRef} />
          </section>

          <footer className="vw-composer">
            {emojiOpen && (
              <div className="vw-emoji-panel">
                {EMOJIS.map((emoji) => <button key={emoji} onClick={() => handleTextChange(`${msgText}${emoji}`)}>{emoji}</button>)}
              </div>
            )}
            <button className="vw-icon-btn" onClick={() => setEmojiOpen(!emojiOpen)}>Emoji</button>
            <button className="vw-icon-btn" onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading ? "Uploading" : "Attach"}</button>
            <input ref={fileRef} type="file" hidden onChange={(e) => handleUpload(e.target.files?.[0])} />
            <textarea
              value={msgText}
              onChange={(e) => handleTextChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Type a message"
              rows={1}
            />
            <button className="vw-send" onClick={sendMessage} disabled={!msgText.trim()}>Send</button>
          </footer>
        </main>
      ) : (
        <main className="vw-empty-panel">
          <h2>Videh Web</h2>
          <p>Select a chat to start messaging</p>
        </main>
      )}

      {infoOpen && activeChat && (
        <aside className="vw-info">
          <button className="vw-close" onClick={() => setInfoOpen(false)}>Close</button>
          <Avatar name={chatName(activeChat)} src={chatAvatar(activeChat)} size={92} />
          <h2>{chatName(activeChat)}</h2>
          <p>{activeChat.is_group ? details?.chat?.group_description || "Group" : activeChat.other_members?.[0]?.about || activeChat.other_members?.[0]?.phone}</p>
          <div className="vw-info-actions">
            <button onClick={async () => { if (token) { const data = await webApi.mute(token, activeChat.id, !activeChat.is_muted); setChats((prev) => prev.map((chat) => chat.id === activeChat.id ? { ...chat, is_muted: data.isMuted } : chat)); } }}>
              {activeChat.is_muted ? "Unmute" : "Mute"}
            </button>
            <button onClick={async () => { if (token) { await webApi.archive(token, activeChat.id, true); await loadChats(); } }}>Archive</button>
          </div>
          <h3>{activeChat.is_group ? "Members" : "Contact"}</h3>
          <div className="vw-members">
            {(details?.members?.length ? details.members : activeChat.other_members || []).map((member) => (
              <div key={member.id} className="vw-member">
                <Avatar name={member.name} src={member.avatar_url} />
                <span>
                  <strong>{member.name}</strong>
                  <small>{member.is_admin ? "Admin" : member.is_online ? "online" : member.phone}</small>
                </span>
              </div>
            ))}
          </div>
        </aside>
      )}
      <WebStyles />
    </div>
  );
}

function WebStyles() {
  return (
    <style>{`
      .vw-shell{display:flex;height:100vh;overflow:hidden;font-family:Segoe UI,Arial,sans-serif;background:#f0f2f5;color:#111b21}
      .vw-sidebar{width:380px;min-width:300px;background:#fff;border-right:1px solid #e9edef;display:flex;flex-direction:column}
      .vw-sidebar-header,.vw-chat-header{height:60px;background:#f0f2f5;display:flex;align-items:center;justify-content:space-between;padding:0 14px;gap:12px}
      .vw-user,.vw-header-person,.vw-member{display:flex;align-items:center;gap:12px}
      .vw-header-person{border:0;background:transparent;cursor:pointer;text-align:left;flex:1;color:inherit}
      .vw-header-person span,.vw-member span{display:flex;flex-direction:column}
      .vw-header-person small,.vw-member small{font-size:12px;color:#667781}
      .vw-avatar{border-radius:50%;object-fit:cover;flex-shrink:0}
      .vw-avatar-fallback{display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700}
      .vw-icon-btn,.vw-send,.vw-close,.vw-info-actions button,.vw-qr-box button{border:0;border-radius:18px;padding:8px 12px;background:#00a884;color:#fff;cursor:pointer;font-weight:600}
      .vw-icon-btn{background:transparent;color:#54656f}
      .vw-icon-btn:hover{background:#e9edef}
      .vw-icon-btn:disabled,.vw-send:disabled{opacity:.5;cursor:default}
      .vw-search{padding:8px 12px;background:#fff}
      .vw-search input,.vw-header-actions input{width:100%;box-sizing:border-box;border:0;outline:0;border-radius:8px;background:#f0f2f5;padding:10px 12px;color:#111b21}
      .vw-chat-list{overflow-y:auto;flex:1}
      .vw-chat-row{width:100%;display:flex;gap:12px;padding:12px 16px;border:0;border-bottom:1px solid #f0f2f5;background:#fff;text-align:left;cursor:pointer;color:inherit}
      .vw-chat-row:hover,.vw-chat-row.active{background:#f0f2f5}
      .vw-chat-main{min-width:0;flex:1}
      .vw-chat-title,.vw-chat-preview{display:flex;justify-content:space-between;gap:8px;align-items:center}
      .vw-chat-title strong,.vw-chat-preview span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .vw-chat-title small{font-size:12px;color:#667781}
      .vw-chat-preview{margin-top:4px;color:#667781;font-size:14px}
      .vw-chat-preview b{background:#00a884;color:#fff;border-radius:10px;padding:2px 7px;font-size:11px}
      .vw-chat{flex:1;display:flex;flex-direction:column;background:#efeae2;background-image:radial-gradient(#d1d7db 1px,transparent 1px);background-size:22px 22px}
      .vw-header-actions{display:flex;gap:8px;align-items:center}
      .vw-header-actions input{width:190px;background:#fff}
      .vw-error{background:#ffd6d6;color:#7a1f1f;padding:8px 16px;text-align:center;cursor:pointer}
      .vw-messages{flex:1;overflow-y:auto;padding:20px 8% 10px}
      .vw-bubble-row{display:flex;margin-bottom:7px}
      .vw-bubble-row.mine{justify-content:flex-end}
      .vw-bubble{position:relative;max-width:min(620px,72%);background:#fff;border-radius:8px 8px 8px 2px;padding:7px 10px;box-shadow:0 1px 2px rgba(0,0,0,.1)}
      .vw-bubble.mine{background:#d9fdd3;border-radius:8px 8px 2px 8px}
      .vw-bubble.deleted{opacity:.65;font-style:italic}
      .vw-bubble p{margin:4px 0;white-space:pre-wrap;word-break:break-word;line-height:1.4}
      .vw-sender{display:block;font-size:12px;color:#008069;margin-bottom:2px}
      .vw-media{display:block;max-width:360px;max-height:320px;border-radius:8px;margin-bottom:6px}
      .vw-audio{width:280px;max-width:100%}
      .vw-doc{display:flex;gap:10px;align-items:center;background:rgba(0,0,0,.06);border-radius:8px;padding:10px;color:#111b21;text-decoration:none;margin-bottom:5px}
      .vw-reactions{display:flex;gap:2px;margin-top:4px}
      .vw-reactions span{background:#fff;border-radius:10px;padding:1px 5px;font-size:12px}
      .vw-meta{display:flex;justify-content:flex-end;align-items:center;gap:4px;color:#667781;font-size:11px}
      .vw-tick{color:#667781;font-size:12px}.vw-tick.read{color:#53bdeb}
      .vw-message-actions{display:none;position:absolute;right:4px;top:-28px;background:#fff;border:1px solid #e9edef;border-radius:14px;box-shadow:0 2px 12px rgba(0,0,0,.16);padding:3px;gap:2px;z-index:2}
      .vw-bubble:hover .vw-message-actions{display:flex}
      .vw-message-actions button{border:0;background:transparent;border-radius:10px;padding:4px 6px;cursor:pointer;color:#111b21}
      .vw-message-actions button:hover{background:#f0f2f5}
      .vw-composer{position:relative;display:flex;align-items:flex-end;gap:8px;background:#f0f2f5;padding:10px 16px}
      .vw-composer textarea{flex:1;resize:none;border:0;border-radius:8px;background:#fff;outline:0;padding:11px 14px;font:inherit;max-height:120px;color:#111b21}
      .vw-emoji-panel{position:absolute;left:14px;bottom:62px;background:#fff;border:1px solid #e9edef;border-radius:16px;padding:8px;box-shadow:0 3px 18px rgba(0,0,0,.18);display:flex;gap:5px}
      .vw-emoji-panel button{border:0;background:#f7f8fa;border-radius:10px;padding:8px;font-size:20px;cursor:pointer}
      .vw-empty,.vw-empty-panel{color:#667781;text-align:center}
      .vw-empty-panel{flex:1;display:flex;align-items:center;justify-content:center;flex-direction:column;background:#f0f2f5}
      .vw-info{width:330px;background:#fff;border-left:1px solid #e9edef;display:flex;flex-direction:column;align-items:center;padding:18px;overflow-y:auto}
      .vw-info h2{margin:12px 0 4px}.vw-info p{color:#667781;text-align:center;margin:0 0 16px}
      .vw-info-actions{display:flex;gap:8px;margin-bottom:20px}
      .vw-members{width:100%;display:flex;flex-direction:column;gap:10px}
      .vw-member{padding:8px;border-radius:10px}.vw-member:hover{background:#f0f2f5}
      .vw-landing{min-height:100vh;background:#f0f2f5;display:flex;flex-direction:column}
      .vw-topbar{height:72px;background:#00a884;display:flex;align-items:center;gap:12px;padding:0 28px;color:#fff;font-weight:700;font-size:18px}
      .vw-topbar img{width:44px;height:44px;object-fit:contain;filter:brightness(0) invert(1)}
      .vw-qr-card{flex:1;display:flex;align-items:center;justify-content:center;gap:70px;padding:30px}
      .vw-qr-card h1{font-weight:300;color:#41525d}.vw-qr-card li{margin-bottom:14px;color:#667781}.vw-tip{color:#667781;background:#fff;border-radius:12px;padding:14px}
      .vw-qr-box{background:#fff;border-radius:18px;padding:28px;box-shadow:0 4px 24px rgba(0,0,0,.1);display:flex;align-items:center;gap:18px;flex-direction:column;min-width:290px}
      .vw-spinner{width:42px;height:42px;border:3px solid #00a884;border-top-color:transparent;border-radius:50%;animation:vw-spin 1s linear infinite}
      @keyframes vw-spin{to{transform:rotate(360deg)}}
      @media(max-width:900px){.vw-sidebar{width:310px}.vw-info{display:none}.vw-messages{padding:14px}.vw-header-actions input{display:none}}
    `}</style>
  );
}

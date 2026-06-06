import { useEffect, useRef, useState } from "react";
import { webApi, type ChatMember, type WebUser } from "../../lib/webApi";
import "./webShell.css";

const EMOJIS = ["😀", "😂", "😍", "😊", "😢", "😡", "👍", "👎", "🙏", "❤️", "🔥", "🎉", "✅", "👋", "💯", "⭐"];

export function useClickOutside(
  ref: React.RefObject<HTMLElement | null>,
  onClose: () => void,
  active: boolean,
) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [active, onClose, ref]);
}

export function DropdownMenu({
  open,
  onClose,
  anchorRef,
  items,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  items: Array<{ label: string; icon?: React.ReactNode; onClick?: () => void; danger?: boolean; divider?: boolean }>;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  useClickOutside(menuRef, onClose, open);

  if (!open) return null;

  const rect = anchorRef.current?.getBoundingClientRect();
  const top = rect ? rect.bottom + 6 : 60;
  const right = rect ? window.innerWidth - rect.right : 16;

  return (
    <div
      ref={menuRef}
      className="vw-dropdown vw-dropdown--message"
      style={{ top, right }}
    >
      {items.map((item, idx) =>
        item.divider ? (
          <div key={`div-${idx}`} className="vw-dropdown__divider" />
        ) : (
        <button
          key={item.label}
          type="button"
          className={`vw-dropdown__item${item.danger ? " vw-dropdown__item--danger" : ""}`}
          onClick={() => {
            item.onClick?.();
            onClose();
          }}
        >
          {item.icon ? <span className="vw-dropdown__icon">{item.icon}</span> : null}
          <span>{item.label}</span>
        </button>
        ),
      )}
    </div>
  );
}

export function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: "100%",
        left: 0,
        marginBottom: 8,
        backgroundColor: "white",
        borderRadius: 12,
        boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
        padding: 10,
        display: "grid",
        gridTemplateColumns: "repeat(8, 1fr)",
        gap: 4,
        zIndex: 50,
      }}
    >
      {EMOJIS.map((e) => (
        <button
          key={e}
          type="button"
          onClick={() => onPick(e)}
          style={{ border: "none", background: "none", fontSize: 22, cursor: "pointer", padding: 4, borderRadius: 6 }}
        >
          {e}
        </button>
      ))}
    </div>
  );
}

export function ProfileModal({
  user,
  onClose,
  onSave,
}: {
  user: WebUser;
  onClose: () => void;
  onSave: (name: string, about: string) => Promise<void>;
}) {
  const [name, setName] = useState(user.name);
  const [about, setAbout] = useState(user.about ?? "");
  const [saving, setSaving] = useState(false);

  return (
    <Modal title="Profile" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label style={labelStyle}>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          About
          <input value={about} onChange={(e) => setAbout(e.target.value)} style={inputStyle} placeholder="Available" />
        </label>
        <p style={{ margin: 0, fontSize: 13, color: "#667781" }}>Phone: {user.phone}</p>
        <button
          type="button"
          disabled={saving || !name.trim()}
          onClick={async () => {
            setSaving(true);
            try {
              await onSave(name.trim(), about.trim());
            } finally {
              setSaving(false);
            }
          }}
          style={primaryBtn}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </Modal>
  );
}

export function NewChatModal({
  token,
  mode,
  onClose,
  onChatOpened,
}: {
  token: string;
  mode: "direct" | "group";
  onClose: () => void;
  onChatOpened: (chatId: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<ChatMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selected, setSelected] = useState<ChatMember[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (query.trim().length < 1) {
      setUsers([]);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const res = await webApi.searchUsers(token, query.trim());
        setUsers(res.users);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Search failed");
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, token]);

  const toggleMember = (u: ChatMember) => {
    setSelected((prev) => (prev.some((m) => m.id === u.id) ? prev.filter((m) => m.id !== u.id) : [...prev, u]));
  };

  const startDirect = async (userId: number) => {
    setBusy(true);
    setError("");
    try {
      const res = await webApi.createDirectChat(token, userId);
      onChatOpened(res.chatId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start chat");
    } finally {
      setBusy(false);
    }
  };

  const createGroup = async () => {
    if (groupName.trim().length < 3) {
      setError("Group name must be at least 3 characters");
      return;
    }
    if (selected.length === 0) {
      setError("Add at least one member");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await webApi.createGroup(token, groupName.trim(), selected.map((m) => m.id));
      onChatOpened(res.chatId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create group");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={mode === "group" ? "New group" : "New chat"} onClose={onClose}>
      {mode === "group" && (
        <label style={{ ...labelStyle, marginBottom: 12 }}>
          Group name
          <input value={groupName} onChange={(e) => setGroupName(e.target.value)} style={inputStyle} placeholder="My group" />
        </label>
      )}
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name or phone"
        style={{ ...inputStyle, marginBottom: 8 }}
        autoFocus
      />
      {mode === "group" && selected.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {selected.map((m) => (
            <span key={m.id} style={{ backgroundColor: "#e7fce3", padding: "4px 10px", borderRadius: 16, fontSize: 13 }}>
              {m.name}
              <button type="button" onClick={() => toggleMember(m)} style={{ marginLeft: 6, border: "none", background: "none", cursor: "pointer" }}>×</button>
            </span>
          ))}
        </div>
      )}
      {error && <p style={{ color: "#e53e3e", fontSize: 13, margin: "0 0 8px" }}>{error}</p>}
      <div style={{ flex: 1, overflowY: "auto", maxHeight: 280 }}>
        {loading && <p style={{ color: "#667781", fontSize: 13 }}>Searching…</p>}
        {!loading && users.length === 0 && query.trim() && <p style={{ color: "#667781", fontSize: 13 }}>No users found</p>}
        {users.map((u) => (
          <div
            key={u.id}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 4px",
              borderBottom: "1px solid #f0f2f5",
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{u.name}</div>
              {u.phone && <div style={{ fontSize: 12, color: "#667781" }}>{u.phone}</div>}
            </div>
            {mode === "direct" ? (
              <button type="button" disabled={busy} onClick={() => startDirect(u.id)} style={smallBtn}>
                Chat
              </button>
            ) : (
              <button
                type="button"
                onClick={() => toggleMember(u)}
                style={{ ...smallBtn, backgroundColor: selected.some((m) => m.id === u.id) ? "#00a884" : "#f0f2f5", color: selected.some((m) => m.id === u.id) ? "white" : "#111b21" }}
              >
                {selected.some((m) => m.id === u.id) ? "Added" : "Add"}
              </button>
            )}
          </div>
        ))}
      </div>
      {mode === "group" && (
        <button type="button" disabled={busy} onClick={createGroup} style={{ ...primaryBtn, marginTop: 12 }}>
          {busy ? "Creating…" : "Create group"}
        </button>
      )}
    </Modal>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div style={{ backgroundColor: "white", borderRadius: 12, width: "min(420px, 92vw)", maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 8px 32px rgba(0,0,0,0.2)", padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{title}</h2>
          <button type="button" onClick={onClose} style={{ border: "none", background: "none", fontSize: 22, cursor: "pointer", color: "#54656f", lineHeight: 1 }} aria-label="Close">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "#54656f", fontWeight: 600 };
const inputStyle: React.CSSProperties = { padding: "10px 12px", border: "1px solid #e9edef", borderRadius: 8, fontSize: 14, outline: "none" };
const primaryBtn: React.CSSProperties = { padding: "12px 16px", backgroundColor: "#00a884", color: "white", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 15 };
const smallBtn: React.CSSProperties = { padding: "6px 14px", backgroundColor: "#00a884", color: "white", border: "none", borderRadius: 16, cursor: "pointer", fontSize: 13, fontWeight: 600 };

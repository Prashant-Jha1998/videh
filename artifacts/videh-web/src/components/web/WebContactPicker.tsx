import { useEffect, useState } from "react";
import { webApi, type ChatMember } from "../../lib/webApi";
import { Avatar, groupContactsByLetter, WA_BG, WA_GREEN, WA_MUTED, WA_TEXT } from "./webUiShared";

export type ContactPickerMode = "direct" | "group-members" | "group-name";

export function WebContactPicker({
  token,
  mode,
  selected,
  onSelectedChange,
  groupName,
  onGroupNameChange,
  onClose,
  onOpenChat,
  onGroupNext,
  onCreateGroup,
  busy,
}: {
  token: string;
  mode: ContactPickerMode;
  selected: ChatMember[];
  onSelectedChange: (members: ChatMember[]) => void;
  groupName: string;
  onGroupNameChange: (name: string) => void;
  onClose: () => void;
  onOpenChat: (userId: number) => void;
  onGroupNext: () => void;
  onCreateGroup: () => void;
  busy?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<ChatMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const q = query.trim();
        const res = q.length > 0
          ? await webApi.searchUsers(token, q)
          : await webApi.contacts(token);
        if (!cancelled) setUsers(res.users);
      } catch {
        if (!cancelled) setUsers([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    const t = setTimeout(load, query.trim() ? 250 : 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [token, query]);

  const title =
    mode === "direct" ? "New chat" : mode === "group-members" ? "Add group members" : "New group";

  const toggle = (u: ChatMember) => {
    if (selected.some((m) => m.id === u.id)) {
      onSelectedChange(selected.filter((m) => m.id !== u.id));
    } else {
      onSelectedChange([...selected, u]);
    }
  };

  if (mode === "group-name") {
    return (
      <SidebarShell title={title} onClose={onClose}>
        <div style={{ padding: 24 }}>
          <p style={{ color: WA_MUTED, fontSize: 14 }}>Group subject</p>
          <input
            value={groupName}
            onChange={(e) => onGroupNameChange(e.target.value)}
            placeholder="Type group subject here"
            autoFocus
            style={{
              width: "100%",
              border: "none",
              borderBottom: `2px solid ${WA_GREEN}`,
              fontSize: 18,
              padding: "12px 0",
              outline: "none",
              marginTop: 8,
            }}
          />
          <p style={{ fontSize: 13, color: WA_MUTED, marginTop: 16 }}>
            {selected.length} member{selected.length !== 1 ? "s" : ""} selected
          </p>
          <button
            type="button"
            disabled={busy || groupName.trim().length < 3}
            onClick={onCreateGroup}
            style={{
              marginTop: 24,
              width: "100%",
              padding: 14,
              backgroundColor: WA_GREEN,
              color: "white",
              border: "none",
              borderRadius: 24,
              fontWeight: 600,
              fontSize: 15,
              cursor: busy ? "wait" : "pointer",
              opacity: groupName.trim().length < 3 ? 0.5 : 1,
            }}
          >
            {busy ? "Creating…" : "Create group"}
          </button>
        </div>
      </SidebarShell>
    );
  }

  const groups = groupContactsByLetter(users);

  return (
    <SidebarShell title={title} onClose={onClose}>
      {mode === "group-members" && selected.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 8,
            padding: "8px 16px",
            overflowX: "auto",
            borderBottom: "1px solid #e9edef",
            alignItems: "center",
          }}
        >
          {selected.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => toggle(m)}
              style={{ border: "none", background: "none", cursor: "pointer", position: "relative" }}
            >
              <Avatar name={m.name ?? "User"} url={m.avatar_url} size={48} />
              <span
                style={{
                  position: "absolute",
                  top: -2,
                  right: -2,
                  background: "#54656f",
                  color: "white",
                  borderRadius: "50%",
                  width: 18,
                  height: 18,
                  fontSize: 12,
                  lineHeight: "18px",
                  textAlign: "center",
                }}
              >
                ×
              </span>
            </button>
          ))}
          <button
            type="button"
            title="Next"
            onClick={onGroupNext}
            style={{
              marginLeft: "auto",
              width: 48,
              height: 48,
              borderRadius: "50%",
              border: "none",
              backgroundColor: WA_GREEN,
              color: "white",
              cursor: "pointer",
              fontSize: 20,
              flexShrink: 0,
            }}
          >
            →
          </button>
        </div>
      )}
      <div style={{ padding: "8px 16px" }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name or number"
          style={{
            width: "100%",
            border: "none",
            borderBottom: "2px solid #00a884",
            padding: "10px 4px",
            fontSize: 14,
            outline: "none",
          }}
        />
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {loading && <p style={{ padding: 16, color: WA_MUTED, fontSize: 14 }}>Loading contacts…</p>}
        {!loading && users.length === 0 && (
          <p style={{ padding: 16, color: WA_MUTED, fontSize: 14, lineHeight: 1.5 }}>
            {query.trim()
              ? "No Videh users found. Check the name or full phone number."
              : "Open Videh on your phone once to sync contacts here. You can also search by name or number below."}
          </p>
        )}
        {groups.map((g) => (
          <div key={g.letter}>
            <div style={{ padding: "8px 20px 4px", fontSize: 13, color: WA_GREEN, fontWeight: 600 }}>{g.letter}</div>
            {g.users.map((u) => {
              const name = u.name ?? u.phone ?? "User";
              const isSelected = selected.some((m) => m.id === u.id);
              return (
                <div
                  key={u.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    if (mode === "direct") onOpenChat(u.id);
                    else toggle(u);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "10px 20px",
                    cursor: "pointer",
                  }}
                >
                  <Avatar name={name} url={u.avatar_url} size={49} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 16, color: WA_TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {name}
                    </div>
                    {u.phone ? (
                      <div style={{ fontSize: 13, color: WA_MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {formatPhoneDisplay(u.phone)}
                      </div>
                    ) : u.about ? (
                      <div style={{ fontSize: 13, color: WA_MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {u.about}
                      </div>
                    ) : null}
                  </div>
                  {mode === "group-members" ? (
                    <div
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        border: `2px solid ${isSelected ? WA_GREEN : "#8696a0"}`,
                        backgroundColor: isSelected ? WA_GREEN : "transparent",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "white",
                        fontSize: 14,
                      }}
                    >
                      {isSelected ? "✓" : ""}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </SidebarShell>
  );
}

function formatPhoneDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  return phone;
}

function SidebarShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      style={{
        width: 380,
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid #e9edef",
        backgroundColor: "white",
        flexShrink: 0,
        height: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 20,
          padding: "16px 20px",
          backgroundColor: WA_BG,
          minHeight: 60,
        }}
      >
        <button type="button" onClick={onClose} style={{ border: "none", background: "none", fontSize: 22, cursor: "pointer", color: "#54656f" }}>
          ×
        </button>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500, color: WA_TEXT }}>{title}</h2>
      </div>
      {children}
    </div>
  );
}

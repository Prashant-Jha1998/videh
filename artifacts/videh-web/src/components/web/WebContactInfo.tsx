import { useEffect, useState } from "react";
import { webApi, type ChatDetails, type WebUser } from "../../lib/webApi";
import { Avatar, WA_BG, WA_GREEN, WA_MUTED, WA_TEXT } from "./webUiShared";

export function WebContactInfo({
  token,
  self,
  chatId,
  onClose,
  onSaveProfile,
  onMuteToggle,
}: {
  token: string;
  self: WebUser;
  chatId: number | null;
  onClose: () => void;
  onSaveProfile: (name: string, about: string) => Promise<void>;
  onMuteToggle?: (muted: boolean) => void;
}) {
  const [details, setDetails] = useState<ChatDetails | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(self.name);
  const [about, setAbout] = useState(self.about ?? "");
  const [saving, setSaving] = useState(false);

  const isSelf = chatId === null;

  useEffect(() => {
    if (isSelf) {
      setName(self.name);
      setAbout(self.about ?? "");
      setDetails(null);
      return;
    }
    webApi.details(token, chatId).then((d) => setDetails(d)).catch(() => setDetails(null));
  }, [token, chatId, isSelf, self.name, self.about]);

  const other = !isSelf ? details?.members?.find((m) => m.id !== self.id) : undefined;
  const displayName = isSelf
    ? self.name
    : details?.chat?.is_group
      ? details.chat.group_name ?? "Group"
      : other?.name ?? "Contact";
  const avatarUrl = isSelf ? self.avatarUrl : other?.avatar_url ?? details?.chat?.group_avatar_url;
  const phone = isSelf ? self.phone : other?.phone;
  const aboutText = isSelf ? about : other?.about;

  return (
    <div
      style={{
        width: 360,
        borderLeft: "1px solid #e9edef",
        backgroundColor: WA_BG,
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        height: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "12px 16px",
          backgroundColor: WA_BG,
          gap: 24,
        }}
      >
        <button type="button" onClick={onClose} style={{ border: "none", background: "none", fontSize: 22, cursor: "pointer", color: "#54656f" }}>
          ×
        </button>
        <span style={{ fontSize: 16, color: WA_TEXT }}>Contact info</span>
        {isSelf && (
          <button
            type="button"
            onClick={() => setEditing((e) => !e)}
            style={{ marginLeft: "auto", border: "none", background: "none", cursor: "pointer", color: WA_MUTED }}
          >
            ✎
          </button>
        )}
      </div>
      <div style={{ flex: 1, overflowY: "auto", backgroundColor: "white" }}>
        <div style={{ padding: "28px 24px", textAlign: "center", backgroundColor: WA_BG }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
            <Avatar name={displayName} url={avatarUrl} size={200} />
          </div>
          {editing && isSelf ? (
            <>
              <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: "100%", textAlign: "center", fontSize: 20, fontWeight: 500, border: "1px solid #e9edef", borderRadius: 8, padding: 8 }} />
              <input value={about} onChange={(e) => setAbout(e.target.value)} placeholder="About" style={{ width: "100%", textAlign: "center", marginTop: 8, fontSize: 14, border: "1px solid #e9edef", borderRadius: 8, padding: 8 }} />
              <button
                type="button"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  try {
                    await onSaveProfile(name.trim(), about.trim());
                    setEditing(false);
                  } finally {
                    setSaving(false);
                  }
                }}
                style={{ marginTop: 12, padding: "10px 24px", backgroundColor: WA_GREEN, color: "white", border: "none", borderRadius: 20, cursor: "pointer", fontWeight: 600 }}
              >
                Save
              </button>
            </>
          ) : (
            <>
              <h2 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 400, color: WA_TEXT }}>{displayName}</h2>
              {phone && <p style={{ margin: 0, color: WA_MUTED, fontSize: 15 }}>{phone}</p>}
            </>
          )}
        </div>
        {aboutText && !editing && (
          <Row label="About" value={aboutText} />
        )}
        {!isSelf && details?.chat?.is_group && (
          <Row label="Members" value={`${details.members.length} participants`} />
        )}
        {!isSelf && onMuteToggle && (
          <button
            type="button"
            onClick={() => onMuteToggle(true)}
            style={rowBtn}
          >
            Mute notifications
          </button>
        )}
        <div style={{ padding: "16px 24px", fontSize: 13, color: WA_MUTED, borderTop: "8px solid #f0f2f5" }}>
          🔒 Messages and calls are end-to-end encrypted
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: "16px 24px", borderTop: "1px solid #f0f2f5" }}>
      <div style={{ fontSize: 13, color: WA_MUTED, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 15, color: WA_TEXT }}>{value}</div>
    </div>
  );
}

const rowBtn: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "16px 24px",
  border: "none",
  borderTop: "1px solid #f0f2f5",
  background: "white",
  fontSize: 15,
  cursor: "pointer",
  color: WA_TEXT,
};

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { webApi, type ChatDetails, type ChatEntry, type ChatMember, type WebUser } from "../../lib/webApi";
import { WEB_CONTACT_PANEL_WIDTH } from "../../lib/webDesktop";
import { Avatar, WA_BG, WA_GREEN, WA_MUTED, WA_TEXT } from "./webUiShared";

function findOtherMember(members: ChatMember[] | undefined, selfId: number): ChatMember | undefined {
  if (!members?.length) return undefined;
  const self = Number(selfId);
  return members.find((m) => Number(m.id) !== self);
}

export function WebContactInfo({
  token,
  self,
  chatId,
  chatPreview,
  onClose,
  onSaveProfile,
  onMuteToggle,
}: {
  token: string;
  self: WebUser;
  chatId: number | null;
  chatPreview?: ChatEntry | null;
  onClose: () => void;
  onSaveProfile: (name: string, about: string) => Promise<void>;
  onMuteToggle?: (muted: boolean) => void;
}) {
  const [details, setDetails] = useState<ChatDetails | null>(null);
  const [loading, setLoading] = useState(false);
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
      setLoading(false);
      return;
    }
    setLoading(true);
    webApi
      .details(token, chatId)
      .then((d) => setDetails({ chat: d.chat, members: d.members ?? [] }))
      .catch(() => setDetails(null))
      .finally(() => setLoading(false));
  }, [token, chatId, isSelf, self.name, self.about]);

  const previewOther = chatPreview?.other_members?.[0];
  const other = useMemo(() => {
    if (isSelf) return undefined;
    return findOtherMember(details?.members, self.id) ?? previewOther;
  }, [isSelf, details?.members, self.id, previewOther]);

  const isGroup = details?.chat?.is_group ?? chatPreview?.is_group ?? false;
  const displayName = isSelf
    ? self.name
    : isGroup
      ? details?.chat?.group_name ?? chatPreview?.group_name ?? "Group"
      : other?.name ?? previewOther?.name ?? "Contact";
  const avatarUrl = isSelf
    ? self.avatarUrl
    : isGroup
      ? details?.chat?.group_avatar_url ?? chatPreview?.group_avatar_url
      : other?.avatar_url ?? previewOther?.avatar_url;
  const phone = isSelf ? self.phone : other?.phone ?? previewOther?.phone;
  const aboutText = isSelf ? about : other?.about ?? previewOther?.about;

  return (
    <div
      style={{
        width: WEB_CONTACT_PANEL_WIDTH,
        maxWidth: "100%",
        borderLeft: "1px solid #e9edef",
        backgroundColor: WA_BG,
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        height: "100%",
        minHeight: 0,
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "12px 16px",
          backgroundColor: WA_BG,
          gap: 16,
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close contact info"
          style={{ border: "none", background: "none", fontSize: 24, lineHeight: 1, cursor: "pointer", color: "#54656f", padding: 4 }}
        >
          ×
        </button>
        <span style={{ fontSize: 16, color: WA_TEXT, fontWeight: 500 }}>Contact info</span>
        {isSelf && (
          <button
            type="button"
            onClick={() => setEditing((e) => !e)}
            style={{ marginLeft: "auto", border: "none", background: "none", cursor: "pointer", color: WA_MUTED, fontSize: 18 }}
          >
            ✎
          </button>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", backgroundColor: "white" }}>
        {loading && !isSelf ? (
          <div style={{ padding: 32, textAlign: "center", color: WA_MUTED }}>Loading…</div>
        ) : (
          <>
            <div style={{ padding: "24px 20px", textAlign: "center", backgroundColor: WA_BG, boxSizing: "border-box" }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
                <Avatar name={displayName} url={avatarUrl} size={168} />
              </div>
              {editing && isSelf ? (
                <>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    style={{
                      width: "100%",
                      maxWidth: "100%",
                      boxSizing: "border-box",
                      textAlign: "center",
                      fontSize: 20,
                      fontWeight: 500,
                      border: "1px solid #e9edef",
                      borderRadius: 8,
                      padding: 8,
                    }}
                  />
                  <input
                    value={about}
                    onChange={(e) => setAbout(e.target.value)}
                    placeholder="About"
                    style={{
                      width: "100%",
                      maxWidth: "100%",
                      boxSizing: "border-box",
                      textAlign: "center",
                      marginTop: 8,
                      fontSize: 14,
                      border: "1px solid #e9edef",
                      borderRadius: 8,
                      padding: 8,
                    }}
                  />
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
                    style={{
                      marginTop: 12,
                      padding: "10px 24px",
                      backgroundColor: WA_GREEN,
                      color: "white",
                      border: "none",
                      borderRadius: 20,
                      cursor: "pointer",
                      fontWeight: 600,
                    }}
                  >
                    Save
                  </button>
                </>
              ) : (
                <>
                  <h2
                    style={{
                      margin: "0 0 6px",
                      fontSize: 22,
                      fontWeight: 400,
                      color: WA_TEXT,
                      wordBreak: "break-word",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {displayName}
                  </h2>
                  {phone && (
                    <p style={{ margin: 0, color: WA_MUTED, fontSize: 15, wordBreak: "break-word" }}>{phone}</p>
                  )}
                </>
              )}
            </div>

            {aboutText && !editing && <Row label="About" value={aboutText} />}
            {!isSelf && isGroup && details?.members && (
              <Row label="Members" value={`${details.members.length} participants`} />
            )}
            {!isSelf && onMuteToggle && (
              <button type="button" onClick={() => onMuteToggle(true)} style={rowBtn}>
                Mute notifications
              </button>
            )}
            <div
              style={{
                padding: "16px 20px",
                fontSize: 13,
                color: WA_MUTED,
                borderTop: "8px solid #f0f2f5",
                lineHeight: 1.45,
                wordBreak: "break-word",
              }}
            >
              🔒 Messages and calls are end-to-end encrypted
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: "16px 20px", borderTop: "1px solid #f0f2f5", boxSizing: "border-box" }}>
      <div style={{ fontSize: 13, color: WA_MUTED, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 15, color: WA_TEXT, wordBreak: "break-word", overflowWrap: "anywhere" }}>{value}</div>
    </div>
  );
}

const rowBtn: CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "16px 20px",
  border: "none",
  borderTop: "1px solid #f0f2f5",
  background: "white",
  fontSize: 15,
  cursor: "pointer",
  color: WA_TEXT,
  boxSizing: "border-box",
};

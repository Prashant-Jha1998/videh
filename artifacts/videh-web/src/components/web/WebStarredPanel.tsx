import type { StarredMessage } from "../../lib/webApi";
import { WA_BG, WA_MUTED, WA_TEXT } from "./webUiShared";

export function WebStarredPanel({
  messages,
  onClose,
  onOpenChat,
}: {
  messages: StarredMessage[];
  onClose: () => void;
  onOpenChat: (chatId: number) => void;
}) {
  return (
    <div style={{ width: 380, display: "flex", flexDirection: "column", borderRight: "1px solid #e9edef", backgroundColor: "white", height: "100%", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20, padding: "16px 20px", backgroundColor: WA_BG }}>
        <button type="button" onClick={onClose} style={{ border: "none", background: "none", fontSize: 22, cursor: "pointer" }}>×</button>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500, color: WA_TEXT }}>Starred messages</h2>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {messages.length === 0 && <p style={{ padding: 24, color: WA_MUTED, textAlign: "center" }}>No starred messages</p>}
        {messages.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onOpenChat(m.chat_id)}
            style={{ display: "block", width: "100%", textAlign: "left", padding: "14px 20px", border: "none", borderBottom: "1px solid #f0f2f5", background: "white", cursor: "pointer" }}
          >
            <div style={{ fontSize: 13, color: WA_MUTED, marginBottom: 4 }}>
              {m.is_group ? m.group_name ?? "Group" : m.sender_name ?? "Chat"}
            </div>
            <div style={{ fontSize: 15, color: WA_TEXT }}>{m.content || "Media"}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

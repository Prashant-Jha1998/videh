import type { CallLogEntry } from "../../lib/webApi";
import { WEB_LIST_PANE_WIDTH } from "../../lib/webDesktop";
import { Avatar } from "./webUiShared";

function formatCallTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 86400000) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diff < 172800000) return "Yesterday";
  return d.toLocaleDateString();
}

function callSubtitle(row: CallLogEntry): string {
  const dir = row.direction === "outgoing" ? "Outgoing" : "Incoming";
  const kind = (row.type ?? "audio") === "video" ? "Video" : "Voice";
  const status = (row.status ?? "").toLowerCase();
  if (status === "missed" || status === "declined") return `${dir} · ${status}`;
  if (row.duration_seconds && row.duration_seconds > 0) {
    const m = Math.floor(row.duration_seconds / 60);
    const s = row.duration_seconds % 60;
    return `${dir} · ${kind} · ${m}:${String(s).padStart(2, "0")}`;
  }
  return `${dir} · ${kind}`;
}

export function WebCallsListPane({
  calls,
  onOpenChat,
}: {
  calls: CallLogEntry[];
  onOpenChat?: (chatId: number) => void;
}) {
  return (
    <div
      style={{
        width: WEB_LIST_PANE_WIDTH,
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid #e9edef",
        backgroundColor: "white",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          padding: "18px 16px 12px",
          backgroundColor: "#f0f2f5",
          fontSize: 20,
          fontWeight: 600,
          color: "#111b21",
        }}
      >
        Calls
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {calls.length === 0 ? (
          <p style={{ padding: 24, color: "#667781", textAlign: "center", fontSize: 14 }}>No recent calls</p>
        ) : (
          calls.map((row) => {
            const name = row.other_user_name ?? "Unknown";
            const missed = (row.status ?? "").toLowerCase() === "missed";
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => {
                  if (row.chat_id && onOpenChat) onOpenChat(row.chat_id);
                }}
                style={{
                  display: "flex",
                  width: "100%",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 16px",
                  border: "none",
                  borderBottom: "1px solid #f0f2f5",
                  background: "white",
                  cursor: row.chat_id ? "pointer" : "default",
                  textAlign: "left",
                }}
              >
                <Avatar name={name} url={row.other_user_avatar} size={49} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ fontWeight: 600, color: missed ? "#ea0038" : "#111b21", fontSize: 16 }}>{name}</span>
                    <span style={{ fontSize: 12, color: "#667781" }}>{formatCallTime(row.created_at)}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#667781", fontSize: 14 }}>
                    <span style={{ color: row.direction === "incoming" && missed ? "#ea0038" : "#667781" }}>
                      {row.direction === "outgoing" ? "↗" : "↙"}
                    </span>
                    <span>{callSubtitle(row)}</span>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

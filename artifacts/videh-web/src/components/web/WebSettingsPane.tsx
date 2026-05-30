import type { WebUser } from "../../lib/webApi";
import { WEB_LIST_PANE_WIDTH } from "../../lib/webDesktop";
import { WA_GREEN } from "./webUiShared";

const ROWS = [
  { label: "Hey Videh", sub: "Voice assistant — use the Videh app", color: "#00A884" },
  { label: "Account", sub: "Security, linked devices", color: "#2196F3" },
  { label: "Privacy", sub: "Blocked, disappearing messages", color: "#9C27B0" },
  { label: "Notifications", sub: "Messages and calls", color: "#FF5722" },
  { label: "Help", sub: "FAQ and support", color: "#3F51B5" },
];

export function WebSettingsPane({
  user,
  onProfileClick,
  onLogout,
}: {
  user: WebUser;
  onProfileClick: () => void;
  onLogout: () => void;
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
      <div style={{ padding: "18px 16px 12px", backgroundColor: "#f0f2f5", fontSize: 20, fontWeight: 600, color: "#111b21" }}>
        Settings
      </div>
      <button
        type="button"
        onClick={onProfileClick}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "16px",
          border: "none",
          borderBottom: "8px solid #f0f2f5",
          background: "white",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt={user.name} style={{ width: 56, height: 56, borderRadius: "50%", objectFit: "cover" }} />
        ) : (
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              backgroundColor: WA_GREEN,
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: 22,
            }}
          >
            {user.name.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div>
          <div style={{ fontWeight: 600, fontSize: 17, color: "#111b21" }}>{user.name}</div>
          <div style={{ fontSize: 14, color: "#667781", marginTop: 2 }}>{user.about || "Hey there! I am using Videh."}</div>
        </div>
      </button>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {ROWS.map((row) => (
          <button
            key={row.label}
            type="button"
            onClick={() => alert(`${row.label}: open the Videh app on your phone for full settings.`)}
            style={{
              display: "flex",
              width: "100%",
              alignItems: "center",
              gap: 14,
              padding: "14px 16px",
              border: "none",
              borderBottom: "1px solid #f0f2f5",
              background: "white",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                backgroundColor: row.color,
                color: "white",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 16,
                fontWeight: 700,
              }}
            >
              {row.label.slice(0, 1)}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, fontSize: 16, color: "#111b21" }}>{row.label}</div>
              <div style={{ fontSize: 13, color: "#667781", marginTop: 2 }}>{row.sub}</div>
            </div>
            <span style={{ color: "#8696a0" }}>›</span>
          </button>
        ))}
        <button
          type="button"
          onClick={onLogout}
          style={{
            display: "block",
            width: "calc(100% - 32px)",
            margin: "24px 16px",
            padding: "12px",
            borderRadius: 8,
            border: "1px solid #ea0038",
            background: "white",
            color: "#ea0038",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Log out
        </button>
      </div>
    </div>
  );
}

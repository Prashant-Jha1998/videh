import type { WebSection } from "../../lib/webDesktop";
import { WEB_NAV_RAIL_WIDTH } from "../../lib/webDesktop";
import { VidehRailLogo } from "./VidehLogo";
import { WA_BG, WA_GREEN } from "./webUiShared";

export type { WebSection };

const ITEMS: Array<{ id: WebSection; title: string; icon: React.ReactNode }> = [
  {
    id: "chats",
    title: "Chats",
    icon: (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
        <path d="M12 20.664a8.5 8.5 0 0 1-4.716-1.32c-2.717-1.667-4.716-4.747-4.716-8.344C2.568 6.5 6.916 2 12 2s9.432 4.5 9.432 9c0 3.597-1.999 6.677-4.716 8.344A8.5 8.5 0 0 1 12 20.664z" />
      </svg>
    ),
  },
  {
    id: "calls",
    title: "Calls",
    icon: (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
        <path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.46.57 3.58a1 1 0 0 1-.25 1.01l-2.2 2.2z" />
      </svg>
    ),
  },
  {
    id: "status",
    title: "Status",
    icon: (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
        <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z" opacity="0.35" />
        <path d="M12 5a7 7 0 0 0-7 7 1 1 0 0 0 2 0 5 5 0 1 1 5 5 1 1 0 0 0 0 2 7 7 0 0 0 0-14z" />
      </svg>
    ),
  },
  {
    id: "starred",
    title: "Starred messages",
    icon: (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
        <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
      </svg>
    ),
  },
  {
    id: "archived",
    title: "Archived",
    icon: (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
        <path d="M20.54 5.23l-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6.5c0-.48-.17-.93-.46-1.27zM12 17.5L6.5 12H10v-2h4v2h3.5L12 17.5zM5.12 5l.81-1h12l.94 1H5.12z" />
      </svg>
    ),
  },
  {
    id: "settings",
    title: "Settings",
    icon: (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
        <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1 1 15.6 12 3.6 3.6 0 0 1 12 15.6z" />
      </svg>
    ),
  },
];

export function WebNavRail({
  active,
  onSectionChange,
  userAvatar,
  userName,
  onProfileClick,
}: {
  active: WebSection;
  onSectionChange: (section: WebSection) => void;
  userAvatar?: string;
  userName: string;
  onProfileClick: () => void;
}) {
  return (
    <div
      style={{
        width: WEB_NAV_RAIL_WIDTH,
        backgroundColor: WA_BG,
        borderRight: "1px solid #e9edef",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "8px 0",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          padding: "12px 0 16px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
          borderBottom: "1px solid #e9edef",
          marginBottom: 8,
          width: "100%",
        }}
      >
        <button
          type="button"
          title="Videh"
          onClick={() => onSectionChange("chats")}
          style={{
            border: "none",
            background: "none",
            cursor: "pointer",
            padding: 4,
            borderRadius: 12,
          }}
        >
          <VidehRailLogo size={40} />
        </button>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
        {ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            title={item.title}
            onClick={() => onSectionChange(item.id)}
            style={{
              width: 48,
              height: 48,
              border: "none",
              borderRadius: 12,
              cursor: "pointer",
              background: active === item.id ? "#e9edef" : "transparent",
              color: active === item.id ? WA_GREEN : "#54656f",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {item.icon}
          </button>
        ))}
      </div>
      <button
        type="button"
        title="Profile"
        onClick={onProfileClick}
        style={{ border: "none", background: "none", cursor: "pointer", padding: 8, marginBottom: 8 }}
      >
        {userAvatar ? (
          <img src={userAvatar} alt={userName} style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover" }} />
        ) : (
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              backgroundColor: WA_GREEN,
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
            }}
          >
            {userName.slice(0, 1).toUpperCase()}
          </div>
        )}
      </button>
    </div>
  );
}

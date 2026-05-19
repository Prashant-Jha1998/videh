import { WA_BG, WA_GREEN } from "./webUiShared";

export type NavTab = "chats" | "status";

export function WebNavRail({
  active,
  onSelect,
  userAvatar,
  userName,
  onProfileClick,
}: {
  active: NavTab;
  onSelect: (tab: NavTab) => void;
  userAvatar?: string;
  userName: string;
  onProfileClick: () => void;
}) {
  const btn = (tab: NavTab, title: string, children: React.ReactNode) => (
    <button
      type="button"
      title={title}
      onClick={() => onSelect(tab)}
      style={{
        width: 48,
        height: 48,
        border: "none",
        borderRadius: 12,
        cursor: "pointer",
        background: active === tab ? "#e9edef" : "transparent",
        color: active === tab ? WA_GREEN : "#54656f",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </button>
  );

  return (
    <div
      style={{
        width: 68,
        backgroundColor: WA_BG,
        borderRight: "1px solid #e9edef",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "8px 0",
        flexShrink: 0,
      }}
    >
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
        {btn(
          "chats",
          "Chats",
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
            <path d="M12 20.664a8.5 8.5 0 0 1-4.716-1.32c-2.717-1.667-4.716-4.747-4.716-8.344C2.568 6.5 6.916 2 12 2s9.432 4.5 9.432 9c0 3.597-1.999 6.677-4.716 8.344A8.5 8.5 0 0 1 12 20.664z" />
          </svg>,
        )}
        {btn(
          "status",
          "Status",
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
            <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z" opacity="0.3" />
            <path d="M12 5a7 7 0 0 0-7 7 1 1 0 0 0 2 0 5 5 0 1 1 5 5 1 1 0 0 0 0 2 7 7 0 0 0 0-14z" />
          </svg>,
        )}
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

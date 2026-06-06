import {
  Archive,
  MessageSquareText,
  Phone,
  Settings,
  Star,
} from "lucide-react";
import type { ReactNode } from "react";
import type { WebSection } from "../../lib/webDesktop";
import { VidehRailLogo } from "./VidehLogo";
import "./webShell.css";

export type { WebSection };

const ICON_SIZE = 21;
const ICON_STROKE = 1.75;

function StatusNavIcon({ active }: { active: boolean }) {
  const color = active ? "#00d4a8" : "#8b9aa3";
  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth={ICON_STROKE} strokeDasharray="3.5 2.5" />
      <circle cx="12" cy="12" r="4.5" stroke={color} strokeWidth={ICON_STROKE} />
    </svg>
  );
}

const ITEMS: Array<{
  id: WebSection;
  title: string;
  render: (active: boolean) => ReactNode;
}> = [
  {
    id: "chats",
    title: "Chats",
    render: (active) => (
      <MessageSquareText size={ICON_SIZE} strokeWidth={ICON_STROKE} color={active ? "#00d4a8" : "#8b9aa3"} />
    ),
  },
  {
    id: "calls",
    title: "Calls",
    render: (active) => (
      <Phone size={ICON_SIZE} strokeWidth={ICON_STROKE} color={active ? "#00d4a8" : "#8b9aa3"} />
    ),
  },
  {
    id: "status",
    title: "Status",
    render: (active) => <StatusNavIcon active={active} />,
  },
  {
    id: "starred",
    title: "Starred messages",
    render: (active) => (
      <Star
        size={ICON_SIZE}
        strokeWidth={ICON_STROKE}
        color={active ? "#00d4a8" : "#8b9aa3"}
        fill={active ? "rgba(0,212,168,0.2)" : "none"}
      />
    ),
  },
  {
    id: "archived",
    title: "Archived",
    render: (active) => (
      <Archive size={ICON_SIZE} strokeWidth={ICON_STROKE} color={active ? "#00d4a8" : "#8b9aa3"} />
    ),
  },
  {
    id: "settings",
    title: "Settings",
    render: (active) => (
      <Settings size={ICON_SIZE} strokeWidth={ICON_STROKE} color={active ? "#00d4a8" : "#8b9aa3"} />
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
    <nav className="vw-rail" aria-label="Main navigation">
      <div className="vw-rail__brand">
        <button type="button" title="Videh" className="vw-rail__brand-btn" onClick={() => onSectionChange("chats")}>
          <VidehRailLogo size={36} />
        </button>
      </div>

      <div className="vw-rail__nav">
        {ITEMS.map((item) => {
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              type="button"
              title={item.title}
              className={`vw-rail__item${isActive ? " vw-rail__item--active" : ""}`}
              onClick={() => onSectionChange(item.id)}
            >
              {item.render(isActive)}
            </button>
          );
        })}
      </div>

      <button type="button" title="Profile" className="vw-rail__profile" onClick={onProfileClick}>
        {userAvatar ? (
          <img src={userAvatar} alt={userName} className="vw-rail__avatar" />
        ) : (
          <div className="vw-rail__avatar-fallback">{userName.slice(0, 1).toUpperCase()}</div>
        )}
      </button>
    </nav>
  );
}

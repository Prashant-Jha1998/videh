import { Archive, Lock, MessageSquare, Monitor, Phone, Shield, Star } from "lucide-react";
import type { WebSection } from "../../lib/webDesktop";
import "./webShell.css";

type Action = { label: string; onClick: () => void };

const HERO_CONFIG: Record<
  WebSection,
  {
    title: string;
    subtitle: string;
    footer?: string;
    actions?: Action[];
    features?: Array<{ icon: typeof MessageSquare; label: string }>;
    icon: typeof MessageSquare;
  }
> = {
  chats: {
    title: "Videh Web",
    subtitle:
      "Send and receive messages without keeping your phone online. Stay connected on up to 4 linked devices with real-time sync.",
    footer: "TLS-secured in transit",
    icon: MessageSquare,
    features: [
      { icon: Monitor, label: "Multi-device" },
      { icon: Shield, label: "Private & secure" },
      { icon: Lock, label: "TLS in transit" },
    ],
  },
  calls: {
    title: "Calls on Videh Web",
    subtitle: "Start voice or video calls from any chat. Your call history stays synced across devices.",
    footer: "Calls use TLS encryption in transit",
    icon: Phone,
    features: [
      { icon: Phone, label: "Voice & video" },
      { icon: Shield, label: "Secure calls" },
    ],
    actions: [
      {
        label: "Open a chat to call",
        onClick: () => alert("Open a chat, then use the call button in the header."),
      },
    ],
  },
  status: {
    title: "Status updates",
    subtitle: "Share photos, videos, and text that disappear after 24 hours. See updates from your contacts.",
    icon: Monitor,
    features: [{ icon: Shield, label: "24-hour privacy" }],
  },
  settings: {
    title: "Videh Settings",
    subtitle: "Manage privacy, security, themes, notifications, and more. Select a category on the left to get started.",
    icon: Shield,
    features: [
      { icon: Lock, label: "Privacy" },
      { icon: Shield, label: "Security" },
      { icon: Monitor, label: "Linked devices" },
    ],
  },
  starred: {
    title: "Starred messages",
    subtitle: "Keep important messages handy. Select a starred message on the left to jump back to its chat.",
    icon: Star,
    features: [{ icon: Star, label: "Quick access" }],
  },
  archived: {
    title: "Archived chats",
    subtitle: "Chats you archive stay out of your main list. Select one on the left to continue the conversation.",
    icon: Archive,
    features: [{ icon: Archive, label: "Organized inbox" }],
  },
};

function HeroVisual({ Icon }: { Icon: typeof MessageSquare }) {
  return (
    <div className="vw-hero__visual">
      <div className="vw-hero__ring" />
      <div className="vw-hero__ring vw-hero__ring--2" />
      <div className="vw-hero__core">
        <Icon size={72} strokeWidth={1.25} color="#b0bcc3" />
      </div>
    </div>
  );
}

export function WebEmptyPane({ section }: { section: WebSection }) {
  const c = HERO_CONFIG[section];
  const Icon = c.icon;

  return (
    <div className="vw-hero">
      <HeroVisual Icon={Icon} />
      <div className="vw-hero__content">
        <h1 className="vw-hero__title">{c.title}</h1>
        <p className="vw-hero__sub">{c.subtitle}</p>
      </div>
      {c.features?.length ? (
        <div className="vw-hero__features">
          {c.features.map((f) => {
            const FIcon = f.icon;
            return (
              <div key={f.label} className="vw-hero__feat">
                <FIcon size={16} strokeWidth={2} />
                {f.label}
              </div>
            );
          })}
        </div>
      ) : null}
      {c.actions?.length ? (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
          {c.actions.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={a.onClick}
              style={{
                padding: "11px 22px",
                borderRadius: 999,
                border: "1px solid #e9edef",
                background: "white",
                color: "#059669",
                fontSize: "0.875rem",
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 2px 8px rgba(17,27,33,0.06)",
                transition: "transform 0.12s ease, box-shadow 0.18s ease",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)";
                (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 6px 16px rgba(17,27,33,0.1)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = "";
                (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 2px 8px rgba(17,27,33,0.06)";
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      ) : null}
      {c.footer ? (
        <div className="vw-hero__footer">
          <Lock size={14} strokeWidth={2} />
          {c.footer}
        </div>
      ) : null}
    </div>
  );
}

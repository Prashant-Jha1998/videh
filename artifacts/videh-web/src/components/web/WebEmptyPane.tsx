import type { WebSection } from "../../lib/webDesktop";

const WA_MUTED = "#667781";

type Action = { label: string; onClick: () => void };

export function WebEmptyPane({ section }: { section: WebSection }) {
  const config: Record<
    WebSection,
    { title: string; subtitle: string; footer?: string; actions?: Action[] }
  > = {
    chats: {
      title: "Videh Web",
      subtitle:
        "Send and receive messages without keeping your phone online. Use Videh on up to 4 linked devices.",
      footer: "End-to-end encrypted",
    },
    calls: {
      title: "Calls on Videh Web",
      subtitle: "Start a voice or video call from a chat, or open a contact on your phone.",
      footer: "Your personal calls are end-to-end encrypted.",
      actions: [
        {
          label: "Start call",
          onClick: () => alert("Open a chat, then use the call button in the header — or start a call from the Videh app."),
        },
      ],
    },
    status: {
      title: "Share status updates",
      subtitle: "Share photos, videos and text that disappear after 24 hours.",
    },
    settings: {
      title: "Videh Settings",
      subtitle: "Choose a category on the left. For full settings, use the Videh app on your phone.",
    },
    starred: {
      title: "Starred messages",
      subtitle: "Select a starred message on the left to open its chat.",
    },
    archived: {
      title: "Archived chats",
      subtitle: "Select an archived chat on the left to continue the conversation.",
    },
  };

  const c = config[section];

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#f0f2f5",
        gap: 20,
        padding: 24,
      }}
    >
      <div
        style={{
          width: 220,
          height: 220,
          backgroundColor: "#e9edef",
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg viewBox="0 0 303 172" width="180" fill="#bfc6cb">
          <path d="M229.565 160.229c32.647-10.984 57.366-41.988 57.366-79.8C286.931 34.963 249.286 0 203.445 0c-34.47 0-64.395 20.467-79.441 50.353A101.733 101.733 0 0 0 100.606 44C45.086 44 0 86.91 0 139.752c0 16.037 4.166 31.13 11.42 44.228H229.565v-23.751z" />
        </svg>
      </div>
      <div style={{ textAlign: "center", maxWidth: 460 }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 24, fontWeight: 300, color: "#41525d" }}>{c.title}</h2>
        <p style={{ margin: 0, color: WA_MUTED, fontSize: 14, lineHeight: 1.5 }}>{c.subtitle}</p>
      </div>
      {c.actions?.length ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
          {c.actions.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={a.onClick}
              style={{
                padding: "10px 18px",
                borderRadius: 24,
                border: "1px solid #e9edef",
                backgroundColor: "#fff",
                color: "#008069",
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      ) : null}
      {c.footer ? (
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: WA_MUTED, fontSize: 13 }}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill={WA_MUTED}>
            <path d="M2.213 10.35a9.681 9.681 0 0 1 9.55-8.35 9.863 9.863 0 0 1 9.861 9.861 9.863 9.863 0 0 1-9.861 9.862 9.681 9.681 0 0 1-8.35-4.769L2.1 22.8l5.937-1.313A9.9 9.9 0 0 0 11.763 22.4a10.863 10.863 0 1 0 0-21.725A10.682 10.682 0 0 0 1.1 9.875L2.213 10.35z" />
          </svg>
          {c.footer}
        </div>
      ) : null}
    </div>
  );
}

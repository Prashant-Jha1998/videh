import { formatCallMessageLabel, parseCallMessageMeta } from "../../lib/callMessage";

export function WebCallMessageBubble({ content, isMe }: { content: string; isMe: boolean }) {
  const meta = parseCallMessageMeta(content);
  if (!meta) return <span>{content}</span>;

  const label = formatCallMessageLabel(meta, isMe);
  const isMissed = meta.result === "missed" || meta.result === "unavailable" || meta.result === "busy";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 180 }}>
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          backgroundColor: isMissed ? "#ea0038" : "#00a884",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="white">
          {meta.callType === "video" ? (
            <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
          ) : (
            <path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.46.57 3.58a1 1 0 0 1-.25 1.01l-2.2 2.2z" />
          )}
        </svg>
      </div>
      <span style={{ fontSize: 14.5, color: isMissed && !isMe ? "#ea0038" : "#111b21", fontStyle: "normal" }}>
        {label}
      </span>
    </div>
  );
}
